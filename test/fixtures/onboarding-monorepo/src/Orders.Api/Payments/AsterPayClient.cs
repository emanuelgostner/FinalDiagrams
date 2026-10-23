using System.Net.Http.Json;
using ParcelDesk.SharedKernel;

namespace ParcelDesk.Orders.Payments;

public sealed class AsterPayClient(HttpClient http)
{
    public async Task<string> Authorize(Money amount, Guid requestKey, CancellationToken cancellation)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/authorizations");
        request.Headers.Add("Idempotency-Key", requestKey.ToString());
        request.Content = JsonContent.Create(new { amount_minor = amount.MinorUnits, currency = amount.Currency });
        using var response = await http.SendAsync(request, cancellation);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<Authorization>(cancellationToken: cancellation);
        return result?.Id ?? throw new InvalidOperationException("Provider returned no authorization ID.");
    }

    private sealed record Authorization(string Id);
}
