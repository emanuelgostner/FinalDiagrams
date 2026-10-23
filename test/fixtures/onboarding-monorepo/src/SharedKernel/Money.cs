namespace ParcelDesk.SharedKernel;

public readonly record struct Money(long MinorUnits, string Currency)
{
    public Money Add(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException("Cannot add different currencies.");
        return new Money(checked(MinorUnits + other.MinorUnits), Currency);
    }
}
