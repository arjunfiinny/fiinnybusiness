export type FieldType = 'text' | 'number' | 'email' | 'phone' | 'date' | 'select' | 'boolean' | 'currency';

export interface FieldOption {
    label: string;
    value: string | number;
}

/**
 * Screens a field can be shown on, beyond the one that owns it.
 *
 * `table` and `export` are the owning screen's own grid and its CSV/print, and
 * remain the legacy visibleInTable / visibleInExport booleans. The rest are
 * other screens that can resolve this entity:
 *
 *   form        the owning screen's add/edit form — where the value is TYPED
 *   pos         POS Billing line items (products only — POS loads the rate sheet)
 *   stockReport Stock Report rows (products only)
 *   worklist    Partner Worklist rows (retailers only)
 *   reports     Reports pages
 *   search      Advanced search / filter inputs
 *
 * A surface is only offered where the screen can actually reach the entity.
 * Firestore has no joins, so a `products` field cannot appear on Worklist
 * (retailers + salesOrders) without denormalising it onto those documents —
 * MODULE_REGISTRY.availableSurfaces encodes what is genuinely reachable rather
 * than showing a checkbox that silently does nothing.
 */
export type FieldSurface =
    | 'form'
    | 'table'
    | 'export'
    | 'pos'
    | 'stockReport'
    | 'worklist'
    | 'reports'
    | 'search';

export type FieldSurfaces = Partial<Record<FieldSurface, boolean>>;

export interface FieldSchema {
    id: string;             // unique identifier (e.g., 'firstName')
    label: string;          // Display name ('First Name')
    type: FieldType;        // Type of input/display formatting
    required: boolean;      // Is the field mandatory?
    editable: boolean;      // Can the user edit this field after creation?
    visibleInTable: boolean;// Should it appear in summary tables?
    visibleInExport: boolean;// Should it appear in CSV exports?
    order: number;          // Position in forms and tables
    options?: FieldOption[];// Dropdown options if type is 'select'
    defaultValue?: any;     // Default value for new records
    systemOnly?: boolean;   // If true, users cannot delete or rename the underlying ID of this field (e.g. 'id', 'createdAt')

    /**
     * True for a column the tenant added themselves, as opposed to one shipped
     * in MODULE_REGISTRY. Custom field ids are always prefixed (see
     * CUSTOM_FIELD_PREFIX in src/utils/customFields.ts) so they can never
     * collide with a system field name, which is what makes it safe to store
     * them flat on the document alongside everything else.
     */
    custom?: boolean;

    /**
     * Which screens show this field. When absent, the legacy visibleInTable /
     * visibleInExport booleans are used — every field predating this stays
     * exactly as configured.
     */
    surfaces?: FieldSurfaces;
}

export interface ModuleSchema {
    moduleId: string;       // e.g., 'retailers', 'orders', 'products'
    moduleName: string;     // Display name ('Retailers')
    fields: FieldSchema[];  // List of configured fields
    updatedAt?: any;        // Firestore Timestamp
    updatedBy?: string;     // User ID who last changed the schema
}
