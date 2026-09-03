import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ModuleSchema } from '../types/schema';
import { fetchSchemaState, saveModuleSchema, resetModuleSchema } from '../services/schemaService';
import { getDefaultSchema } from '../config/moduleRegistry';
import { useAuth } from './AuthContext';

interface SchemaContextType {
    schemas: Record<string, ModuleSchema>;
    /**
     * Modules this tenant has actually saved a layout for. Everything else in
     * `schemas` is the registry default, which the builder needs to distinguish
     * so it only offers "Reset to default" where there is something to reset.
     */
    savedModuleIds: Set<string>;
    loading: boolean;
    getSchema: (moduleId: string) => ModuleSchema | undefined;
    updateSchema: (moduleId: string, newSchema: ModuleSchema) => Promise<void>;
    /** Delete the saved layout so the module falls back to its registry default. */
    resetSchema: (moduleId: string) => Promise<void>;
    refreshSchemas: () => Promise<void>;
}

const SchemaContext = createContext<SchemaContextType | undefined>(undefined);

export function SchemaProvider({ children }: { children: ReactNode }) {
    const { tenantId } = useAuth();
    const [schemas, setSchemas] = useState<Record<string, ModuleSchema>>({});
    const [savedModuleIds, setSavedModuleIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    const loadSchemas = async () => {
        if (!tenantId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const { schemas: allSchemas, savedModuleIds: savedIds } = await fetchSchemaState(tenantId);
            const schemaMap: Record<string, ModuleSchema> = {};

            allSchemas.forEach(schema => {
                schemaMap[schema.moduleId] = schema;
            });

            setSchemas(schemaMap);
            setSavedModuleIds(savedIds);
        } catch (error) {
            console.error("Failed to load schemas:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSchemas();
    }, [tenantId]);

    const getSchema = (moduleId: string) => {
        return schemas[moduleId];
    };

    const updateSchema = async (moduleId: string, newSchema: ModuleSchema) => {
        if (!tenantId) return;
        await saveModuleSchema(tenantId, moduleId, newSchema);

        // Update local state instantly
        setSchemas(prev => ({
            ...prev,
            [moduleId]: newSchema
        }));
        setSavedModuleIds(prev => new Set(prev).add(moduleId));
    };

    const resetSchema = async (moduleId: string) => {
        if (!tenantId) return;
        await resetModuleSchema(tenantId, moduleId);

        // Fall back to the registry default in place, so the builder and every
        // table using this module re-render without a full refetch.
        const fallback = getDefaultSchema(moduleId);
        setSchemas(prev => {
            if (!fallback) {
                const next = { ...prev };
                delete next[moduleId];
                return next;
            }
            return { ...prev, [moduleId]: fallback };
        });
        setSavedModuleIds(prev => {
            const next = new Set(prev);
            next.delete(moduleId);
            return next;
        });
    };

    return (
        <SchemaContext.Provider value={{ schemas, savedModuleIds, loading, getSchema, updateSchema, resetSchema, refreshSchemas: loadSchemas }}>
            {children}
        </SchemaContext.Provider>
    );
}

export function useSchema() {
    const context = useContext(SchemaContext);
    if (!context) {
        throw new Error('useSchema must be used within a SchemaProvider');
    }
    return context;
}
