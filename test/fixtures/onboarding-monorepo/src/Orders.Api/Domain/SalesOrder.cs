using System.ComponentModel.DataAnnotations.Schema;
using ParcelDesk.SharedKernel;

namespace ParcelDesk.Orders.Domain;

public sealed class SalesOrder
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = "";
    public string BuyerEmail { get; set; } = "";
    public long TotalInCents { get; set; }
    public string Currency { get; set; } = "EUR";
    public string? DeliveryNote { get; set; }
    public string? AuthorizationId { get; set; }
    public List<SalesOrderItem> Items { get; set; } = [];

    [NotMapped]
    public Money Total => new(TotalInCents, Currency);
}
