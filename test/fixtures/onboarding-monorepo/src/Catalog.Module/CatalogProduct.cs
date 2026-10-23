using System.ComponentModel.DataAnnotations.Schema;
using ParcelDesk.SharedKernel;

namespace ParcelDesk.Catalog;

public sealed class CatalogProduct
{
    public Guid Id { get; set; }
    public string StockCode { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public long PriceInCents { get; set; }
    public string CurrencyCode { get; set; } = "EUR";

    [NotMapped]
    public Money Price => new(PriceInCents, CurrencyCode);
}
