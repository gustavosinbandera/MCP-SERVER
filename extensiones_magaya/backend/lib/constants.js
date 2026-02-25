// Constantes compartidas (tipos Entity, Accounting, DbClassType)

// DbClassType -> nombre (Hyperion)
exports.dbClassTypeNames = ['Unknown','Quotation','PickupOrder','WarehouseReceipt','CargoRelease','Shipment','Invoice','CreditMemo','Bill','CheckNumber','Credit','Payment','Deposit','JournalEntry','Check','WarehouseItem','Container','Booking','Job','PurchaseOrder','SalesOrder','Folder','Document','Entity','Location','Message','Notes','ShipmentFolder','Charge','ChargeDefinition','Carrier','Client','Employee','Company','Division','Salesperson','Vendor','WarehouseProvider','Account','Task','TaskType','WarehouseZone','CargoMovement','ItemDefinition','CargoCount','CountSession','Rate','Clause','ScheduleB','Port','Country','Package','EntityContact','ItemDefinitionCategory','Attachment','Contract','ContractAmendment','AccountTransaction','CargoMovementItemReference','RemoteUser','CourierShipment','Route','RouteSegment','ModeOfTransportation','CustomCharge','Vessel','CloseOfDay','EntityGroup','PricingRule','PricingTier','HTS','LogItem'];

// Tipos de entidad (Entity.*.List)
exports.ENTITY_TYPES = [
    { key: 'all', label: 'All', path: ['Entity', 'All', 'List'] },
    { key: 'allActive', label: 'All Active', path: ['Entity', 'All', 'ActiveList'] },
    { key: 'customers', label: 'Customers', path: ['Entity', 'Customer', 'List'] },
    { key: 'vendors', label: 'Vendors', path: ['Entity', 'Vendor', 'List'] },
    { key: 'carriers', label: 'Carriers', path: ['Entity', 'Carrier', 'List'] },
    { key: 'warehouseProviders', label: 'Warehouse Providers', path: ['Entity', 'WarehouseProvider', 'List'] },
    { key: 'forwardingAgents', label: 'Forwarding Agents', path: ['Entity', 'ForwardingAgent', 'List'] },
    { key: 'employees', label: 'Employees', path: ['Entity', 'Employee', 'List'] },
    { key: 'salespeople', label: 'Salespeople', path: ['Entity', 'Salesperson', 'List'] },
    { key: 'contacts', label: 'Contacts', path: ['Entity', 'Contact', 'List'] },
    { key: 'vessels', label: 'Vessels', path: ['Entity', 'Vessel', 'List'] }
];

// Tipos de transacción contable (Accounting.*)
exports.ACCTRANSACTION_TYPES = [
    { key: 'bills', label: 'Bills', path: ['Accounting', 'Bill', 'ListByNumber'] },
    { key: 'invoices', label: 'Invoices', path: ['Accounting', 'Invoice', 'ListByNumber'] },
    { key: 'payments', label: 'Payments', path: ['Accounting', 'Payment', 'ListByTime'] },
    { key: 'checks', label: 'Checks', path: ['Accounting', 'Check', 'ListByNumber'] },
    { key: 'deposits', label: 'Deposits', path: ['Accounting', 'Deposit', 'ListByTime'] },
    { key: 'journalEntries', label: 'Journal Entries', path: ['Accounting', 'JournalEntry', 'ListByNumber'] }
];

// Tipos de entidad permitidos para asignar a transacciones (sin all/allActive/employees)
exports.ASSIGN_ENTITY_TYPES = [
    { key: 'customers', label: 'Customers', path: ['Entity', 'Customer', 'List'] },
    { key: 'vendors', label: 'Vendors', path: ['Entity', 'Vendor', 'List'] },
    { key: 'carriers', label: 'Carriers', path: ['Entity', 'Carrier', 'List'] },
    { key: 'warehouseProviders', label: 'Warehouse Providers', path: ['Entity', 'WarehouseProvider', 'List'] },
    { key: 'forwardingAgents', label: 'Forwarding Agents', path: ['Entity', 'ForwardingAgent', 'List'] },
    { key: 'salespeople', label: 'Salespeople', path: ['Entity', 'Salesperson', 'List'] },
    { key: 'contacts', label: 'Contacts', path: ['Entity', 'Contact', 'List'] },
    { key: 'vessels', label: 'Vessels', path: ['Entity', 'Vessel', 'List'] }
];

// EntityType: dos fuentes en el proyecto C++
// 1) CEntity (Common/user.h) - valores que persiste el DB y devuelve el API:
//    Entity=0x0001, Client=0x0002, WHProvider=0x0004, ForwardAgent=0x0008, Carrier=0x0020,
//    Vendor=0x0040, Employee=0x0080, SalesMan=0x0100, Division=0x0200, EntityContact=0x0400
// 2) EntityConceptBuilder (Hyperion) - FLAG(n)=(1<<n) para el script; orden distinto.
// El API devuelve los valores de CEntity (user.h).

// Por valor CEntity (Common/user.h) — usar primero
exports.ENTITY_TYPE_BY_CENTITY = {
    1: 'Entity',
    2: 'Client',
    4: 'WarehouseProvider',   // WHProvider
    8: 'ForwardingAgent',     // ForwardAgent
    32: 'Carrier',
    64: 'Vendor',
    128: 'Employee',
    256: 'Salesperson',      // SalesMan
    512: 'Division',
    1024: 'EntityContact'
};

// Por posición 1-based (EntityConceptBuilder orden)
exports.ENTITY_TYPE_BY_POSITION = {
    1: 'Entity',
    2: 'Client',
    3: 'WarehouseProvider',
    4: 'ForwardingAgent',
    5: 'Other',
    6: 'Carrier',
    7: 'Vendor',
    8: 'Employee',
    9: 'Salesperson',
    10: 'Division',
    11: 'EntityContact'
};

// Por valor bit FLAG(n) = (1 << n) → 2, 4, 8, 16, 64, 128, 256, 512, 1024, 2048
exports.ENTITY_TYPE_BY_FLAG = {
    0: 'Entity',
    1: 'Entity',
    2: 'Entity',      // FLAG(1)
    4: 'Client',      // FLAG(2)
    8: 'WarehouseProvider',   // FLAG(3)
    16: 'ForwardingAgent',    // FLAG(4)
    32: 'Other',      // FLAG(5) no usado en C++
    64: 'Carrier',    // FLAG(6)
    128: 'Vendor',    // FLAG(7)
    256: 'Employee',  // FLAG(8)
    512: 'Salesperson', // FLAG(9)
    1024: 'Division',  // FLAG(10)
    2048: 'EntityContact' // FLAG(11)
};
exports.ENTITY_TYPE_FLAGS_ORDER = [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2];
// Por índice 0-based (fallback)
exports.ENTITY_TYPE_BY_INDEX = ['Entity', 'Client', 'WarehouseProvider', 'ForwardingAgent', 'Other', 'Carrier', 'Vendor', 'Employee', 'Salesperson', 'Division', 'EntityContact'];
