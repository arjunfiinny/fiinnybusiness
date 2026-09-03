import type { ModuleSchema, FieldSchema, FieldSurface } from '../types/schema';

/**
 * Every screen the UI Layout Builder can configure.
 *
 * WHY A REGISTRY
 * --------------
 * The builder used to know about exactly two modules, via two hardcoded
 * branches in schemaService (`if (moduleId === 'retailers') ... if 'orders'`),
 * and its dropdown was built from `Object.keys(schemas)` — i.e. only what was
 * already saved in Firestore. Two consequences:
 *
 *   1. Adding a screen meant editing three places and hoping they agreed.
 *   2. fetchAllSchemas only seeded when the collection was EMPTY, so any module
 *      added later could never appear for an existing tenant. Their ui_schemas
 *      collection is non-empty, so the seed branch never ran again.
 *
 * This file is now the single source of truth. Add an entry here and the module
 * shows up in the builder, gets a default layout, and is saveable — no
 * migration, no per-tenant backfill.
 *
 * FIELD IDS MUST MATCH THE REAL DOCUMENTS. Each entry below was written by
 * reading the interface the owning page actually uses; the source is named in
 * the comment above each schema. A field id that does not exist on the document
 * renders an empty column, so check the page before adding one.
 *
 * NOT EVERY SCREEN BELONGS HERE. Dashboards, Analytics and Reports render
 * computed aggregates rather than records with configurable columns — there is
 * no field list to arrange. Only record-backed screens are registered.
 */

/** Grouping for the builder's dropdown, so 7+ modules stay navigable. */
export type ModuleGroup = 'Parties' | 'Catalogue' | 'Transactions' | 'Operations';

export interface ModuleDefinition {
    group: ModuleGroup;
    /**
     * Nav labels of the screens this layout drives, exactly as they read in the
     * sidebar/top nav. Admins look for the screen name they clicked, not an
     * internal collection name, so moduleName and this list both use nav
     * wording — "Inventory", not "Products / Rate Sheet".
     */
    usedBy: string;
    /** Firestore collection the fields belong to. */
    collection: string;
    schema: ModuleSchema;
    /**
     * Fields that genuinely exist on the document but are NOT in the default
     * layout. "Add Field" offers these instead of only inventing a blank
     * custom_field_<timestamp>, which produced columns bound to nothing.
     *
     * Sourced from the same interfaces as `schema` — see the comment above each
     * module. Anything not listed here can still be added as a custom field.
     */
    extraFields: FieldSchema[];
    /**
     * Screens that can actually resolve this entity, and therefore the only
     * surfaces the builder may offer for its fields.
     *
     * Firestore has no joins. A products column can appear on POS Billing and
     * Stock Report because both already load the rate sheet, but it cannot
     * appear on Worklist, which reads retailers and salesOrders and has no
     * reference to a product. Offering that checkbox would produce a column
     * that is permanently blank, so the option is simply not offered.
     */
    availableSurfaces: FieldSurface[];
}

/** Surfaces every module has: its own form, grid, CSV/print and search. */
const OWN_SURFACES: FieldSurface[] = ['form', 'table', 'export', 'search'];

const f = (
    id: string,
    label: string,
    type: FieldSchema['type'],
    order: number,
    opts: Partial<FieldSchema> = {},
): FieldSchema => ({
    id,
    label,
    type,
    required: false,
    editable: true,
    visibleInTable: true,
    visibleInExport: true,
    order,
    ...opts,
});

export const MODULE_REGISTRY: ModuleDefinition[] = [
    // ── Parties ─────────────────────────────────────────────────────────────
    {
        group: 'Parties',
        usedBy: 'Retailers, Worklist, Customer Profiles',
        collection: 'retailers',
        availableSurfaces: [...OWN_SURFACES, 'worklist', 'reports'],
        extraFields: [
            f('district', 'District', 'text', 100, { visibleInTable: false }),
            f('taluka', 'Taluka', 'text', 101, { visibleInTable: false }),
            f('atPost', 'At/Post', 'text', 102, { visibleInTable: false }),
            f('totalSales', 'Total Sales', 'currency', 103, { editable: false }),
            f('totalPaid', 'Total Paid', 'currency', 104, { editable: false }),
            f('closestCreditDays', 'Credit Days', 'number', 105),
        ],
        schema: {
            moduleId: 'retailers',
            moduleName: 'Retailers & Customer Profiles',
            fields: [
                f('name', 'Retailer Name', 'text', 1, { required: true, systemOnly: true }),
                f('number', 'Contact Number', 'phone', 2, { required: true }),
                f('location', 'Location/Village', 'text', 3),
                f('portfolioSize', 'Portfolio Size', 'select', 4, {
                    required: true,
                    options: [
                        { label: 'Big', value: 'Big' },
                        { label: 'Medium', value: 'Medium' },
                        { label: 'Small', value: 'Small' },
                    ],
                }),
                f('outstandingAmount', 'Outstanding Balance', 'currency', 5, {
                    editable: false,
                    systemOnly: true,
                }),
                f('email', 'Email Address', 'email', 6, { visibleInTable: false }),
                f('bookName', 'Book Name', 'text', 7, { visibleInTable: false }),
                f('billBookPageNo', 'Bill Book Page No', 'text', 8, { visibleInTable: false }),
                f('alternateNumber', 'Alternate Mobile', 'phone', 9, { visibleInTable: false }),
            ],
        },
    },
    {
        // Shape from the Supplier interface in src/pages/SupplierLedgerPage.tsx
        group: 'Parties',
        usedBy: 'Supplier Ledger',
        collection: 'suppliers',
        availableSurfaces: [...OWN_SURFACES, 'reports'],
        extraFields: [],
        schema: {
            moduleId: 'suppliers',
            moduleName: 'Supplier Ledger',
            fields: [
                f('name', 'Supplier Name', 'text', 1, { required: true, systemOnly: true }),
                f('phone', 'Phone', 'phone', 2),
                f('email', 'Email', 'email', 3, { visibleInTable: false }),
                f('address', 'Address', 'text', 4, { visibleInTable: false }),
                f('supplierType', 'Supplier Type', 'text', 5),
                f('outstandingBalance', 'Outstanding Balance', 'currency', 6, {
                    editable: false,
                    systemOnly: true,
                }),
                f('totalInvoiced', 'Total Invoiced', 'currency', 7, { editable: false }),
                f('totalPaid', 'Total Paid', 'currency', 8, { editable: false }),
            ],
        },
    },

    // ── Catalogue ───────────────────────────────────────────────────────────
    {
        // Shape from the Product interface in src/pages/RateSheetPage.tsx
        group: 'Catalogue',
        usedBy: 'Inventory, Barcode Labels, Inventory Batches',
        collection: 'products',
        availableSurfaces: [...OWN_SURFACES, 'pos', 'stockReport', 'reports'],
        extraFields: [
            f('baseUnit', 'Base Unit', 'text', 100, { visibleInTable: false }),
            f('loosePieces', 'Loose Pieces', 'number', 101, { editable: false }),
            f('boxCapacity', 'Box Capacity', 'number', 102),
            f('margin', 'Margin', 'text', 103),
            f('batchNumber', 'Batch Number', 'text', 104, { visibleInTable: false }),
            f('mfgDate', 'Mfg Date', 'date', 105, { visibleInTable: false }),
            f('expiryDate', 'Expiry Date', 'date', 106, { visibleInTable: false }),
            f('imageUrl', 'Product Image URL', 'text', 107, { visibleInTable: false }),
        ],
        schema: {
            moduleId: 'products',
            moduleName: 'Inventory (Rate Sheet)',
            fields: [
                f('name', 'Product Name', 'text', 1, { required: true, systemOnly: true }),
                f('productNumber', 'Product Code', 'text', 2),
                f('type', 'Category', 'text', 3),
                f('mfgCompany', 'Manufacturer', 'text', 4),
                f('unitSize', 'Unit Size', 'number', 5),
                f('unitMeasure', 'Unit Measure', 'text', 6),
                f('gstPct', 'GST %', 'number', 7),
                f('maxRetailPrice', 'MRP', 'currency', 8, { required: true }),
                f('purchasePrice', 'Purchase Price', 'currency', 9),
                f('sellingPrice', 'Selling Price', 'currency', 10, { required: true }),
                f('retailerPrice', 'Retailer Price (PTR)', 'currency', 11),
                f('quantity', 'Stock Qty', 'number', 12, { editable: false, systemOnly: true }),
                f('description', 'Description', 'text', 13, { visibleInTable: false }),
            ],
        },
    },

    // ── Transactions ────────────────────────────────────────────────────────
    {
        group: 'Transactions',
        usedBy: 'Order History',
        collection: 'orders',
        availableSurfaces: [...OWN_SURFACES],
        extraFields: [],
        schema: {
            moduleId: 'orders',
            moduleName: 'Order History (legacy)',
            fields: [
                f('productName', 'Product Name', 'text', 1, { required: true, editable: false, systemOnly: true }),
                f('quantity', 'Quantity', 'number', 2, { required: true }),
                f('unit', 'Unit', 'select', 3, {
                    required: true,
                    options: [
                        { label: 'Boxes', value: 'Boxes' },
                        { label: 'Pieces', value: 'Pieces' },
                    ],
                }),
                f('amount', 'Total Amount', 'currency', 4, { required: true, systemOnly: true }),
                f('paymentStatus', 'Payment Status', 'select', 5, {
                    required: true,
                    systemOnly: true,
                    options: [
                        { label: 'Paid', value: 'Paid' },
                        { label: 'Unpaid', value: 'Unpaid' },
                    ],
                }),
                f('talkedTo', 'Talked To', 'text', 6),
                f('notes', 'Notes', 'text', 7, { visibleInTable: false }),
            ],
        },
    },
    {
        // Shape from what POSPage writes and DigitalKhataPage/WorklistPage read.
        // status and deleted are systemOnly: Khata, POS and Worklist all filter on
        // them to hide cancelled and soft-deleted bills, so renaming either id
        // would silently un-hide cancelled bills across three screens.
        group: 'Transactions',
        usedBy: 'POS Billing, Khata (Udhari), B2B GST Invoice, Worklist',
        collection: 'salesOrders',
        availableSurfaces: [...OWN_SURFACES, 'worklist', 'reports'],
        extraFields: [
            f('invoiceType', 'Invoice Type', 'text', 100, { editable: false, visibleInTable: false }),
            f('retailerId', 'Retailer ID', 'text', 101, { editable: false, visibleInTable: false }),
            f('salesPerson', 'Sales Person', 'text', 102),
            f('transportName', 'Transport', 'text', 103, { visibleInTable: false }),
            f('notes', 'Notes', 'text', 104, { visibleInTable: false }),
        ],
        schema: {
            moduleId: 'salesOrders',
            moduleName: 'POS Billing & Invoices',
            fields: [
                f('orderNumber', 'Invoice / Bill No', 'text', 1, { required: true, editable: false, systemOnly: true }),
                f('invoiceDate', 'Invoice Date', 'date', 2, { required: true }),
                f('customerName', 'Customer Name', 'text', 3, { required: true }),
                f('customerPhone', 'Customer Phone', 'phone', 4),
                f('retailerName', 'Retailer', 'text', 5),
                f('grandTotal', 'Grand Total', 'currency', 6, { editable: false, systemOnly: true }),
                f('amountPaid', 'Amount Paid', 'currency', 7, { systemOnly: true }),
                f('paymentStatus', 'Payment Status', 'select', 8, {
                    systemOnly: true,
                    options: [
                        { label: 'Paid', value: 'Paid' },
                        { label: 'Partial', value: 'Partial' },
                        { label: 'Unpaid', value: 'Unpaid' },
                    ],
                }),
                f('paymentMethod', 'Payment Method', 'select', 9, {
                    options: [
                        { label: 'Cash', value: 'Cash' },
                        { label: 'UPI', value: 'UPI' },
                        { label: 'Card', value: 'Card' },
                        { label: 'Credit', value: 'Credit' },
                    ],
                }),
                f('status', 'Bill Status', 'text', 10, { editable: false, systemOnly: true, visibleInTable: false }),
                f('dueDate', 'Due Date', 'date', 11, { visibleInTable: false }),
            ],
        },
    },
    {
        // Shape from the Expense interface in src/pages/ExpensePage.tsx
        group: 'Transactions',
        usedBy: 'Expenses',
        collection: 'expenses',
        availableSurfaces: [...OWN_SURFACES, 'reports'],
        extraFields: [
            f('linkedEmployeeId', 'Linked Employee ID', 'text', 100, { editable: false, visibleInTable: false }),
        ],
        schema: {
            moduleId: 'expenses',
            moduleName: 'Expenses',
            fields: [
                f('name', 'Expense Name', 'text', 1, { required: true, systemOnly: true }),
                f('category', 'Category', 'text', 2, { required: true }),
                f('amount', 'Amount', 'currency', 3, { required: true }),
                f('date', 'Date', 'date', 4, { required: true }),
                f('linkedEmployeeName', 'Linked Employee', 'text', 5),
                f('notes', 'Notes', 'text', 6, { visibleInTable: false }),
            ],
        },
    },

    // ── Operations ──────────────────────────────────────────────────────────
    {
        // Shape from the Transporter interface in src/pages/ManageTransportPage.tsx
        group: 'Operations',
        usedBy: 'Manage Transport, Dispatch Board',
        collection: 'transporters',
        availableSurfaces: [...OWN_SURFACES],
        extraFields: [],
        schema: {
            moduleId: 'transporters',
            moduleName: 'Manage Transport',
            fields: [
                f('name', 'Transporter Name', 'text', 1, { required: true, systemOnly: true }),
                f('contactPerson', 'Contact Person', 'text', 2),
                f('mobile', 'Mobile', 'phone', 3, { required: true }),
                f('altMobile', 'Alternate Mobile', 'phone', 4, { visibleInTable: false }),
                f('vehicleType', 'Vehicle Type', 'text', 5),
                f('vehicleRoute', 'Route', 'text', 6),
                f('area', 'Area', 'text', 7),
                f('notes', 'Notes', 'text', 8, { visibleInTable: false }),
            ],
        },
    },
];

/** Registry lookup by moduleId. */
export const getModuleDefinition = (moduleId: string): ModuleDefinition | undefined =>
    MODULE_REGISTRY.find((m) => m.schema.moduleId === moduleId);

/** A fresh deep copy of a module's default schema — safe to mutate. */
export const getDefaultSchema = (moduleId: string): ModuleSchema | undefined => {
    const def = getModuleDefinition(moduleId);
    return def ? (JSON.parse(JSON.stringify(def.schema)) as ModuleSchema) : undefined;
};

export const ALL_DEFAULT_SCHEMAS = (): ModuleSchema[] =>
    MODULE_REGISTRY.map((m) => JSON.parse(JSON.stringify(m.schema)) as ModuleSchema);

/** Surfaces the builder may offer for a module's fields. */
export const getAvailableSurfaces = (moduleId: string): FieldSurface[] =>
    getModuleDefinition(moduleId)?.availableSurfaces ?? ['form', 'table', 'export'];

export const MODULE_GROUPS: ModuleGroup[] = ['Parties', 'Catalogue', 'Transactions', 'Operations'];

/**
 * Fields that exist on this module's documents but are not currently in the
 * layout — i.e. what "Add Field" can legitimately offer.
 *
 * Includes any default field the admin previously removed, so removing a column
 * and changing your mind does not mean retyping its id from memory and getting
 * it subtly wrong.
 */
export const getAddableFields = (
    moduleId: string,
    currentFieldIds: string[],
): FieldSchema[] => {
    const def = getModuleDefinition(moduleId);
    if (!def) return [];
    const present = new Set(currentFieldIds);
    return [...def.schema.fields, ...def.extraFields]
        .filter((field) => !present.has(field.id))
        .map((field) => JSON.parse(JSON.stringify(field)) as FieldSchema)
        .sort((a, b) => a.label.localeCompare(b.label));
};
