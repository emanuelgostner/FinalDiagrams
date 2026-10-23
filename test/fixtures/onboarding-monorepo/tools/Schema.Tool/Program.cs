using System.Reflection;
using Npgsql;

// Run once per environment before starting services. Migration names are the journal keys.
var connectionString = Environment.GetEnvironmentVariable("PARCELDESK_DATABASE")
    ?? throw new InvalidOperationException("Set PARCELDESK_DATABASE for the target environment.");
await using var connection = new NpgsqlConnection(connectionString);
await connection.OpenAsync();
await using (var setup = new NpgsqlCommand("""
    CREATE SCHEMA IF NOT EXISTS platform;
    CREATE TABLE IF NOT EXISTS platform.schema_journal
      (migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
    """, connection)) await setup.ExecuteNonQueryAsync();

var assembly = Assembly.GetExecutingAssembly();
foreach (var name in assembly.GetManifestResourceNames().Where(n => n.EndsWith(".sql")).Order())
{
    await using var exists = new NpgsqlCommand(
        "SELECT EXISTS(SELECT 1 FROM platform.schema_journal WHERE migration_name = @name)", connection);
    exists.Parameters.AddWithValue("name", name);
    if ((bool)(await exists.ExecuteScalarAsync())!) continue;
    using var reader = new StreamReader(assembly.GetManifestResourceStream(name)!);
    var sql = await reader.ReadToEndAsync();
    await using var transaction = await connection.BeginTransactionAsync();
    await using var apply = new NpgsqlCommand(sql, connection, transaction);
    await apply.ExecuteNonQueryAsync();
    await using var record = new NpgsqlCommand(
        "INSERT INTO platform.schema_journal(migration_name) VALUES (@name)", connection, transaction);
    record.Parameters.AddWithValue("name", name);
    await record.ExecuteNonQueryAsync();
    await transaction.CommitAsync();
}
