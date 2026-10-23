using Microsoft.EntityFrameworkCore;
using ParcelDesk.Catalog;
using ParcelDesk.Orders.Domain;

namespace ParcelDesk.Orders.Data;

// Orders owns order_headers and order_items. Catalog mappings are shared for FK navigation.
// Schema changes run through Schema.Tool; this application never calls EnsureCreated/Migrate.
public sealed class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public DbSet<SalesOrder> Orders => Set<SalesOrder>();
    public DbSet<CatalogProduct> Products => Set<CatalogProduct>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.ApplyConfiguration(new CatalogProductConfiguration());
        var order = model.Entity<SalesOrder>();
        order.ToTable("order_headers", "sales");
        order.HasKey(o => o.Id);
        order.Property(o => o.Id).HasColumnName("order_id");
        order.Property(o => o.OrderNumber).HasColumnName("public_reference");
        order.HasIndex(o => o.OrderNumber).IsUnique();
        order.Property(o => o.BuyerEmail).HasColumnName("buyer_email");
        order.Property(o => o.TotalInCents).HasColumnName("total_minor");
        order.Property(o => o.Currency).HasColumnName("currency_code").HasMaxLength(3);
        order.Property(o => o.DeliveryNote).HasColumnName("delivery_instructions");
        order.Property(o => o.AuthorizationId).HasColumnName("payment_authorization");

        var item = model.Entity<SalesOrderItem>();
        item.ToTable("order_items", "sales");
        item.HasKey(i => new { i.OrderId, i.ProductId });
        item.Property(i => i.OrderId).HasColumnName("order_id");
        item.Property(i => i.ProductId).HasColumnName("product_id");
        item.Property(i => i.Units).HasColumnName("quantity");
        item.Property(i => i.QuotedUnitPrice).HasColumnName("unit_price_minor");
        item.HasOne(i => i.Order).WithMany(o => o.Items).HasForeignKey(i => i.OrderId);
        item.HasOne(i => i.Product).WithMany().HasForeignKey(i => i.ProductId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
