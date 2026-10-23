import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,access} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const temporaryRoot=resolve(tmpdir());
const python=process.env.PYTHON||'python';
const unzip=String.raw`
import json, pathlib, sys, zipfile
archive, destination = sys.argv[1:]
target = pathlib.Path(destination).resolve()
with zipfile.ZipFile(archive) as bundle:
    names = bundle.namelist()
    if bundle.testzip() is not None:
        raise RuntimeError('Archive CRC verification failed')
    for name in names:
        candidate = (target / name).resolve()
        if not candidate.is_relative_to(target):
            raise RuntimeError('Unsafe archive path: ' + name)
    bundle.extractall(target)
print(json.dumps(names))
`;

async function removeReleaseTemporaryDirectory(directory){
  const target=resolve(directory),within=relative(temporaryRoot,target);
  if(!within||within==='..'||within.startsWith('../')||within.startsWith('..\\')||isAbsolute(within)||!basename(target).startsWith('fd-release-'))throw new Error(`Refusing cleanup outside the release test temporary directory: ${target}`);
  await rm(target,{recursive:true,force:true});
}

async function files(path){
  const result=[];
  for(const entry of await readdir(path,{withFileTypes:true})){
    const child=join(path,entry.name);
    if(entry.isDirectory())result.push(...await files(child));else if(entry.isFile())result.push(child);
  }
  return result;
}

async function checkReferences(skillDirectory){
  for(const path of await files(skillDirectory)){
    if(!path.endsWith('.md')||path.includes(`${join('assets','finaldiagrams')}`))continue;
    const content=await readFile(path,'utf8');
    for(const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
      const target=match[1].replace(/^<|>$/g,'').split('#')[0];
      if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('/'))continue;
      await assert.doesNotReject(access(resolve(dirname(path),decodeURIComponent(target))),`Broken packaged reference ${target} in ${path}`);
    }
  }
}

for(const [archiveName,baseDirectory,hasWrapper,isPlugin] of [
  ['finaldiagrams-plugin.zip','finaldiagrams/skills/finaldiagrams',true,true],
  ['finaldiagrams-skill.zip','finaldiagrams',false,false],
  ['finaldiagrams-skills.zip','finaldiagrams',true,false],
  ['finaldiagrams-copilot-skills.zip','finaldiagrams',true,false],
]){
  test(`${archiveName}: standard ZIP reader, references and extracted CLI work without node_modules`,async t=>{
    const directory=await mkdtemp(join(temporaryRoot,'fd-release-'));t.after(()=>removeReleaseTemporaryDirectory(directory));
    const archive=join(root,'artifacts',archiveName);
    const result=spawnSync(python,['-c',unzip,archive,directory],{encoding:'utf8',maxBuffer:2*1024*1024});
    assert.equal(result.status,0,result.stderr||'Python 3 with its standard zipfile module is required for release verification. Run npm run package first.');
    const entries=JSON.parse(result.stdout);
    assert.ok(!entries.some(path=>/(^|\/)node_modules(\/|$)/.test(path)));
    assert.equal(entries.filter(path=>path.endsWith('/dist/runtime.js')).length,1,'Exactly one compiled runtime per archive.');
    assert.equal(entries.some(path=>path.includes('monorepo-onboarding/SKILL.md')),hasWrapper);
    assert.ok(!entries.some(path=>/monorepo-onboarding\/assets\//.test(path)),'The wrapper reuses the base runtime.');
    assert.equal(entries.some(path=>path.includes('host-config/')),isPlugin,'Native worker definitions belong to the complete plugin.');
    const base=join(directory,baseDirectory);
    await checkReferences(base);
    if(hasWrapper){
      const wrapper=join(directory,isPlugin?'finaldiagrams/skills/monorepo-onboarding':'monorepo-onboarding');
      await checkReferences(wrapper);
      const canonical=await readFile(join(root,'skills/monorepo-onboarding/SKILL.md'),'utf8');
      const expected=archiveName==='finaldiagrams-copilot-skills.zip'?canonical.replace(/^(---\r?\n)name: monorepo-onboarding(?=\r?\n)/,'$1name: finaldiagrams:monorepo-onboarding'):canonical;
      assert.equal(await readFile(join(wrapper,'SKILL.md'),'utf8'),expected,'Only the Copilot CLI bundle qualifies the onboarding skill name; all workflow instructions are shared.');
    }
    if(isPlugin){
      const pluginRoot=join(directory,'finaldiagrams');
      const releaseVersion=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
      for(const manifestPath of ['plugin.json','.codex-plugin/plugin.json','.claude-plugin/plugin.json']){
        const manifest=JSON.parse(await readFile(join(pluginRoot,manifestPath),'utf8'));
        assert.equal(manifest.version,releaseVersion,`${manifestPath} matches the release version.`);
        if(manifestPath==='.claude-plugin/plugin.json'){
          assert.equal(manifest.agents.length,2);
          for(const agent of manifest.agents)await assert.doesNotReject(access(resolve(pluginRoot,agent)),'Registered native agent is included in the plugin.');
        }
      }
      await checkReferences(join(pluginRoot,'host-config'));
      for(const worker of ['module-scanner','database-scanner']){
        const definition=await readFile(join(directory,'finaldiagrams/host-config/claude/agents',`${worker}.md`),'utf8');
        assert.match(definition,/model:\s*["']?claude-sonnet-5-5/);
      }
    }
    const source=join(directory,'document.json'),output=join(directory,'document.html'),extracted=join(directory,'extracted.json');
    const model=JSON.parse(await readFile(join(root,'examples/input-validation-state.json'),'utf8'));
    await writeFile(source,JSON.stringify(model));
    const run=(...args)=>{
      const child=spawnSync(process.execPath,[join(base,'scripts','finaldiagrams.mjs'),...args],{cwd:directory,encoding:'utf8',env:{...process.env,NODE_PATH:''}});
      assert.equal(child.status,0,child.stderr);return child.stdout;
    };
    assert.match(run('validate',source),/Valid:/);
    run('export',source,'-o',output);run('extract',output,'-o',extracted);
    assert.deepEqual(JSON.parse(await readFile(extracted,'utf8')),model);
    assert.match(await readFile(output,'utf8'),/id="fd-notices"/);
  });
}
