import type { FieldSchema, FieldSurface, ModuleSchema } from '../types/schema';

/**
 * Tenant-defined columns — the "add a column to the table" feature.
 *
 * STORAGE MODEL
 * -------------
 * A custom field's value is stored FLAT on the entity document, under the
 * field's own id:
 *
 *     tenants/{tenantId}/products/{productId}
 *         name: "Urea 50kg"          <- system field
 *         cf_rackNumber: "A-12"      <- tenant's custom column
 *
 * Flat, not nested under a `customFields` map, because every renderer in this
 * codebase already reads `row[field.id]` — WorklistPage's CSV export and print,
 * DynamicForm, DynamicTable. Storing flat means those keep working with no
 * resolver and no change, and Firestore can still order/filter on the value
 * (a nested map is queryable too, but every existing call site would have to
 * learn about it).
 *
 * The usual objection to flat storage is collision: a custom column called
 * "status" would clobber a real one. That is prevented by reserving a prefix
 * rather than by nesting — every custom id starts with CUSTOM_FIELD_PREFIX and
 * the builder will not accept an id that does not.
 *
 * TENANT ISOLATION
 * ----------------
 * Two independent mechanisms already guarantee it, so nothing extra is needed:
 *
 *   definition  tenants/{tenantId}/ui_schemas/{moduleId}  — one schema doc per
 *               tenant, and firestore.rules now scopes ui_schemas reads/writes
 *               to that tenant (admin/analyst to write).
 *   value       getTenantCollection() resolves to tenants/{tenantId}/{coll}, so
 *               the data lives under the tenant too.
 *
 * A column added by tenant A is therefore invisible to tenant B twice over:
 * B's schema document does not contain the field, and B's documents are in a
 * different path entirely.
 *
 * NO MIGRATION
 * ------------
 * Firestore is schemaless, so adding a column costs nothing and existing
 * documents simply have no value for it. Readers must treat a missing custom
 * value as empty, never as an error — see readFieldValue below.
 */

export const CUSTOM_FIELD_PREFIX = 'cf_';

export const isCustomField = (field: Pick<FieldSchema, 'id' | 'custom'>): boolean =>
    field.custom === true || field.id.startsWith(CUSTOM_FIELD_PREFIX);

/** Turn a human label into a stable, collision-proof field id. */
export const makeCustomFieldId = (label: string): string => {
    const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return `${CUSTOM_FIELD_PREFIX}${slug || `field_${Date.now()}`}`;
};

export interface FieldIdCheck {
    ok: boolean;
    reason?: string;
}

/**
 * Guard the id before it reaches Firestore. A bad id is not a cosmetic problem:
 * a dot creates a nested path, a slash is illegal in a field mask, and an
 * unprefixed id could overwrite a system column on every document of that type.
 */
export const validateCustomFieldId = (id: string, existingIds: string[]): FieldIdCheck => {
    if (!id.startsWith(CUSTOM_FIELD_PREFIX)) {
        return { ok: false, reason: `Custom field ids must start with "${CUSTOM_FIELD_PREFIX}".` };
    }
    const body = id.slice(CUSTOM_FIELD_PREFIX.length);
    if (body.length === 0) return { ok: false, reason: 'Give the field a name.' };
    if (!/^[a-z0-9_]+$/.test(body)) {
        return { ok: false, reason: 'Use only lowercase letters, numbers and underscores.' };
    }
    if (existingIds.filter((x) => x === id).length > 1) {
        return { ok: false, reason: `"${id}" is already used on this screen.` };
    }
    return { ok: true };
};

/**
 * Is this field shown on `surface`?
 *
 * Falls back to the legacy booleans when `surfaces` is absent, so every field
 * configured before surfaces existed keeps its current behaviour. Any other
 * surface defaults to false — a new column appears where the admin asked for
 * it and nowhere else.
 */
export const isOnSurface = (field: FieldSchema, surface: FieldSurface): boolean => {
    if (field.surfaces && field.surfaces[surface] !== undefined) {
        return field.surfaces[surface] === true;
    }
    if (surface === 'table') return field.visibleInTable;
    if (surface === 'export') return field.visibleInExport;
    // The owning screen's form shows everything editable unless told otherwise,
    // which is how these screens behaved before surfaces existed.
    if (surface === 'form') return field.editable;
    return false;
};

/** Fields to render on a given surface, in the admin's configured order. */
export const fieldsForSurface = (
    schema: ModuleSchema | undefined,
    surface: FieldSurface,
): FieldSchema[] => {
    if (!schema) return [];
    return schema.fields
        .filter((f) => isOnSurface(f, surface))
        .sort((a, b) => a.order - b.order);
};

/** Just the tenant-added columns, for surfaces that render them separately. */
export const customFieldsForSurface = (
    schema: ModuleSchema | undefined,
    surface: FieldSurface,
): FieldSchema[] => fieldsForSurface(schema, surface).filter(isCustomField);

/**
 * Read a field off a document. Missing custom values are normal — the column
 * was added after the document was written — so this returns undefined rather
 * than throwing, and callers render an empty cell.
 */
export const readFieldValue = (
    doc: Record<string, unknown> | undefined | null,
    field: Pick<FieldSchema, 'id'>,
): unknown => (doc ? doc[field.id] : undefined);

/**
 * Pull just the custom values out of a form payload, ready to merge into the
 * document being saved. Empty strings are dropped so an untouched optional
 * column does not litter every document with "".
 */
export const collectCustomValues = (
    schema: ModuleSchema | undefined,
    formData: Record<string, unknown>,
): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (!schema) return out;
    schema.fields.filter(isCustomField).forEach((field) => {
        const value = formData[field.id];
        if (value === undefined || value === null || value === '') return;
        out[field.id] = field.type === 'number' || field.type === 'currency' ? Number(value) : value;
    });
    return out;
};
