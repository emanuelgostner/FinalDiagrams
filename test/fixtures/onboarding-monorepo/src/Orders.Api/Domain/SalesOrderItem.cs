using ParcelDesk.Catalog;

namespace ParcelDesk.Orders.Domain;

public sealed class SalesOrderItem
{
    public Guid OrderId { get; set; }
    public SalesOrder Order { get; set; } = null!;
    public Guid ProductId { get; set; }
    public CatalogProduct Product { get; set; } = null!;
    public int Units { get; set; }
    public long QuotedUnitPrice { get; set; }
}
