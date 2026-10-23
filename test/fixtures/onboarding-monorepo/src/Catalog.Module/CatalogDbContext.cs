using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ParcelDesk.Catalog;

// Catalog owns product maintenance. Other modules may read the same product rows.
public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<CatalogProduct> Products => Set<CatalogProduct>();
    protected override void OnModelCreating(ModelBuilder model) =>
        model.ApplyConfiguration(new CatalogProductConfiguration());
}

public sealed class CatalogProductConfiguration : IEntityTypeConfiguration<CatalogProduct>
{
    public void Configure(EntityTypeBuilder<CatalogProduct> product)
    {
        product.ToTable("products", "catalog");
        product.HasKey(p => p.Id);
        product.Property(p => p.Id).HasColumnName("product_id");
        product.Property(p => p.StockCode).HasColumnName("sku_code").HasMaxLength(48);
        product.HasIndex(p => p.StockCode).IsUnique();
        product.Property(p => p.DisplayName).HasColumnName("display_name");
        product.Property(p => p.PriceInCents).HasColumnName("price_minor");
        product.Property(p => p.CurrencyCode).HasColumnName("currency_code").HasMaxLength(3);
    }
}
