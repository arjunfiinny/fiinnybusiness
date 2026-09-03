import { getDoc, setDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { ModuleSchema } from '../types/schema';
import { getTenantDoc, getTenantCollection } from '../utils/tenantPath';
import { MODULE_REGISTRY, getDefaultSchema, ALL_DEFAULT_SCHEMAS } from '../config/moduleRegistry';

export const SCHEMA_COLLECTION = 'ui_schemas';

/**
 * Default layouts live in src/config/moduleRegistry.ts, not here.
 *
 * This file used to carry two hardcoded schemas and branch on
 * `if (moduleId === 'retailers') ... if (moduleId === 'orders')`, which meant
 * adding a screen to the builder required edits in three files. Everything now
 * reads the registry, so a new entry there is immediately fetchable, seedable
 * and saveable.
 */

export const fetchModuleSchema = async (
    tenantId: string,
    moduleId: string,
): Promise<ModuleSchema> => {
    try {
        const schemaRef = getTenantDoc(db, tenantId, SCHEMA_COLLECTION, moduleId);
        const schemaSnap = await getDoc(schemaRef);

        if (schemaSnap.exists()) {
            return schemaSnap.data() as ModuleSchema;
        }

        const fallback = getDefaultSchema(moduleId);
        if (fallback) return fallback;

        throw new Error(`Schema for module "${moduleId}" is not in MODULE_REGISTRY.`);
    } catch (error) {
        console.error(`Error fetching schema for ${moduleId}:`, error);
        throw error;
    }
};

/**
 * Every configurable module, saved layout where one exists and the registry
 * default everywhere else.
 *
 * The previous version returned ONLY what Firestore held, and seeded defaults
 * only when the collection was completely empty. For any tenant that had ever
 * saved a layout the seed branch never ran again, so a module added to the
 * product later could never appear in their builder. Merging on read fixes that
 * without a per-tenant migration: defaults are simply the value until an admin
 * saves something over them.
 *
 * Nothing is written here. Seeding on read would mean a tenant merely opening
 * the builder silently acquires documents for screens they never touched, and
 * those frozen copies would then stop tracking future default changes.
 */
export interface SchemaState {
    schemas: ModuleSchema[];
    /** Modules the tenant has actually saved; the rest are registry defaults. */
    savedModuleIds: Set<string>;
}

export const fetchSchemaState = async (tenantId: string): Promise<SchemaState> => {
    try {
        const snap = await getDocs(getTenantCollection(db, tenantId, SCHEMA_COLLECTION));
        const saved = new Map<string, ModuleSchema>();
        snap.docs.forEach((d) => {
            const data = d.data() as ModuleSchema;
            if (data?.moduleId) saved.set(data.moduleId, data);
        });

        // Registry order first, so the builder's grouping stays stable.
        const merged: ModuleSchema[] = ALL_DEFAULT_SCHEMAS().map(
            (def) => saved.get(def.moduleId) ?? def,
        );

        // A saved layout for a module no longer in the registry (renamed or
        // retired) is still returned, so an admin can see and clean it up
        // rather than having it vanish silently.
        const registryIds = new Set(MODULE_REGISTRY.map((m) => m.schema.moduleId));
        saved.forEach((schema, id) => {
            if (!registryIds.has(id)) merged.push(schema);
        });

        return { schemas: merged, savedModuleIds: new Set(saved.keys()) };
    } catch (error) {
        console.error('Error fetching all schemas:', error);
        throw error;
    }
};

export const saveModuleSchema = async (
    tenantId: string,
    moduleId: string,
    schema: ModuleSchema,
): Promise<void> => {
    try {
        const schemaRef = getTenantDoc(db, tenantId, SCHEMA_COLLECTION, moduleId);
        await setDoc(schemaRef, {
            ...schema,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error(`Error saving schema for ${moduleId}:`, error);
        throw error;
    }
};

/**
 * Drop the tenant's saved layout so the module falls back to the registry
 * default. Deletes rather than overwriting with a copy of the default, so the
 * module keeps tracking future changes to that default.
 */
export const resetModuleSchema = async (tenantId: string, moduleId: string): Promise<void> => {
    if (!getDefaultSchema(moduleId)) {
        throw new Error(`Cannot reset "${moduleId}" — it has no registry default.`);
    }
    try {
        await deleteDoc(getTenantDoc(db, tenantId, SCHEMA_COLLECTION, moduleId));
    } catch (error) {
        console.error(`Error resetting schema for ${moduleId}:`, error);
        throw error;
    }
};
