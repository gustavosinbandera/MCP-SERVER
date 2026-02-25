/**
 * IntelliSense para el API de Hyperion en extensiones Node.js (dbx, request.dbx, etc.)
 * Referencia: HyperionTest/Test.js, hyperion-express-middleware
 */

declare namespace Hyperion {
  /** Lista por tiempo (cursor para .using().iterate()) */
  interface ListByTime {}
  /** Lista por número (cursor para .using().from().iterate()) */
  interface ListByNumber {}

  interface Currency {
    Code: string;
  }

  interface Bill {
    Number: string | number;
    TotalAmount: number;
    Currency: Currency;
    TransactionDate?: unknown;
    DueDate?: unknown;
    Date?: unknown;
    Vendor?: { Name: string };
    AccountName?: string;
    Status?: string | number;
    AmountPaid?: number;
    AmountDue?: number;
  }

  interface Accounting {
    Bill: {
      ListByTime: ListByTime;
      ListByNumber: ListByNumber;
    };
  }

  interface Warehousing {
    Inventory: { ListByTime: ListByTime; ListByNumber?: ListByNumber };
    WarehouseReceipt: { ListByTime: ListByTime; ListByNumber: ListByNumber };
    ItemDefinition: { ListByNumber: ListByNumber; Type: { StockItem: unknown } };
  }

  interface Cursor<T = unknown> {
    iterate(callback: (item: T) => boolean | void): void;
    reverse?(): Cursor<T>;
    from?(key: string | Date): Cursor<T>;
    to?(key: string | Date): Cursor<T>;
  }

  interface Dbx {
    using(list: ListByTime | ListByNumber): Cursor;
    Accounting: Accounting;
    Warehousing: Warehousing;
    Money?: (amount: number, currencyCode: string) => { toString(): string };
    Weight?: (value: number, unit: unknown, precision?: number) => { toString(): string; convertTo(unit: unknown): unknown };
    Uom?: { Weight: { Pound: unknown; Kilogram: unknown } };
  }
}

declare global {
  namespace Express {
    interface Request {
      /** Hyperion handle (namespaces: Accounting, Warehousing, .using(), etc.) */
      dbx: Hyperion.Dbx | null;
      /** Hyperion algorithms */
      algorithm: unknown;
      /** API del clientId (ej. getAccessToken) */
      api: unknown;
      dbw?: unknown;
    }
  }
}

export {};
