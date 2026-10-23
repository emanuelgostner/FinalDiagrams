using Microsoft.EntityFrameworkCore;
using ParcelDesk.Orders.Data;
using ParcelDesk.Orders.Domain;
using ParcelDesk.Orders.Payments;
using ParcelDesk.SharedKernel;

// ParcelDesk is a fictional small commerce backend used as a source-reading fixture.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<OrdersDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Commerce")));
builder.Services.AddHttpClient<AsterPayClient>(client =>
    client.BaseAddress = new Uri(builder.Configuration["Payments:BaseUrl"]!));
var app = builder.Build();

app.MapPost("/orders", async (PlaceOrder command, OrdersDbContext db, AsterPayClient payments,
    CancellationToken cancellation) =>
{
    if (command.Units <= 0) return Results.BadRequest("Units must be positive.");
    var product = await db.Products.SingleOrDefaultAsync(p => p.Id == command.ProductId, cancellation);
    if (product is null) return Results.NotFound();
    var amount = new Money(checked(product.PriceInCents * command.Units), product.CurrencyCode);
    var authorization = await payments.Authorize(amount, command.RequestKey, cancellation);
    var order = new SalesOrder
    {
        Id = Guid.NewGuid(), OrderNumber = "PD-" + Guid.NewGuid().ToString("N")[..10],
        BuyerEmail = command.BuyerEmail, TotalInCents = amount.MinorUnits, Currency = amount.Currency,
        DeliveryNote = command.DeliveryNote, AuthorizationId = authorization,
        Items = [new SalesOrderItem { ProductId = product.Id, Units = command.Units,
            QuotedUnitPrice = product.PriceInCents }]
    };
    db.Orders.Add(order);
    await db.SaveChangesAsync(cancellation);
    return Results.Created($"/orders/{order.Id}", new { order.Id, order.OrderNumber });
});

app.MapGet("/orders/{id:guid}", async (Guid id, OrdersDbContext db, CancellationToken cancellation) =>
{
    var order = await db.Orders.AsNoTracking().Include(o => o.Items)
        .SingleOrDefaultAsync(o => o.Id == id, cancellation);
    return order is null ? Results.NotFound() : Results.Ok(order);
});
app.Run();

record PlaceOrder(Guid ProductId, int Units, string BuyerEmail, string? DeliveryNote, Guid RequestKey);
