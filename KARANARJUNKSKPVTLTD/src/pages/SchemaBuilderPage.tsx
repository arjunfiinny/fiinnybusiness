import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, AlertCircle, CheckCircle2, LayoutTemplate, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSchema } from '../contexts/SchemaContext';
import type { FieldSchema, ModuleSchema, FieldType } from '../types/schema';
import {
    MODULE_GROUPS,
    getModuleDefinition,
    getDefaultSchema,
    getAddableFields,
    getAvailableSurfaces,
} from '../config/moduleRegistry';
import {
    makeCustomFieldId,
    validateCustomFieldId,
    isCustomField,
    isOnSurface,
} from '../utils/customFields';
import type { FieldSurface } from '../types/schema';

export default function SchemaBuilderPage() {
    const { t } = useTranslation();
    const { schemas, updateSchema, resetSchema, savedModuleIds, loading } = useSchema();
    const [selectedModule, setSelectedModule] = useState<string>('retailers');
    const [editedSchema, setEditedSchema] = useState<ModuleSchema | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Initialize local edit state when module changes
    useEffect(() => {
        if (!loading && schemas[selectedModule]) {
            // Deep clone to avoid mutating context directly before save
            setEditedSchema(JSON.parse(JSON.stringify(schemas[selectedModule])));
        }
    }, [selectedModule, schemas, loading]);

    const handleSave = async () => {
        if (!editedSchema) return;
        try {
            setIsSaving(true);
            setSaveMessage(null);

            // Re-order based on array index before saving
            const finalSchema = {
                ...editedSchema,
                fields: editedSchema.fields.map((f, idx) => ({ ...f, order: idx + 1 }))
            };

            await updateSchema(selectedModule, finalSchema);
            setSaveMessage({ type: 'success', text: 'Schema layout saved successfully!' });
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (error: any) {
            setSaveMessage({ type: 'error', text: error.message || 'Failed to save schema' });
        } finally {
            setIsSaving(false);
        }
    };

    /**
     * Add a field that actually exists on this module's documents.
     *
     * "Add Field" used to append a blank `custom_field_<timestamp>` bound to
     * nothing, so the only way to surface a real column was to know its exact
     * Firestore key and type it by hand — and a typo produced a silently empty
     * column. The picker is built from the registry, so it offers real ids with
     * the right type and label already set. A default field the admin removed
     * earlier shows up here too, making removal reversible.
     */
    const addKnownField = (fieldId: string) => {
        if (!editedSchema || !fieldId) return;
        const field = addableFields.find((f) => f.id === fieldId);
        if (!field) return;
        setEditedSchema({
            ...editedSchema,
            fields: [...editedSchema.fields, { ...field, order: editedSchema.fields.length + 1 }],
        });
    };

    /**
     * Add a brand-new tenant column — the "add a column to the table" case.
     *
     * The id is derived from the label and always carries the cf_ prefix, which
     * is what makes it safe to store the value flat on the document: a column
     * called "Status" becomes cf_status and can never overwrite the real
     * status field that Khata, POS and Worklist filter on.
     */
    const addCustomField = () => {
        if (!editedSchema) return;
        const label = window.prompt(t('schemaBuilder.newFieldPrompt'));
        if (!label || !label.trim()) return;

        const id = makeCustomFieldId(label);
        const check = validateCustomFieldId(id, [...editedSchema.fields.map(f => f.id), id]);
        if (!check.ok) {
            setSaveMessage({ type: 'error', text: check.reason ?? 'Invalid field name.' });
            return;
        }
        if (editedSchema.fields.some(f => f.id === id)) {
            setSaveMessage({ type: 'error', text: t('schemaBuilder.fieldExists', { id }) });
            return;
        }

        const newField: FieldSchema = {
            id,
            label: label.trim(),
            type: 'text',
            required: false,
            editable: true,
            visibleInTable: true,
            visibleInExport: true,
            custom: true,
            // Starts on the owning screen only. Other surfaces are opt-in so a
            // new column cannot silently appear on POS or a report.
            surfaces: { form: true, table: true, export: true },
            order: editedSchema.fields.length + 1
        };
        setEditedSchema({
            ...editedSchema,
            fields: [...editedSchema.fields, newField]
        });
    };

    /**
     * Toggle one surface for one field.
     *
     * table and export also write the legacy visibleInTable / visibleInExport
     * booleans, because WorklistPage's CSV export and print still read those
     * directly. Keeping them in sync means existing screens need no change.
     */
    const toggleSurface = (index: number, surface: FieldSurface, on: boolean) => {
        if (!editedSchema) return;
        const fields = [...editedSchema.fields];
        const field = { ...fields[index] };
        field.surfaces = { ...(field.surfaces ?? {}), [surface]: on };
        if (surface === 'table') field.visibleInTable = on;
        if (surface === 'export') field.visibleInExport = on;
        fields[index] = field;
        setEditedSchema({ ...editedSchema, fields });
    };

    const updateField = (index: number, key: keyof FieldSchema, value: any) => {
        if (!editedSchema) return;
        const newFields = [...editedSchema.fields];
        newFields[index] = { ...newFields[index], [key]: value };
        setEditedSchema({ ...editedSchema, fields: newFields });
    };

    const removeField = (index: number) => {
        if (!editedSchema) return;
        const field = editedSchema.fields[index];
        if (field.systemOnly) {
            alert('Cannot delete a system required field.');
            return;
        }
        const newFields = [...editedSchema.fields];
        newFields.splice(index, 1);
        setEditedSchema({ ...editedSchema, fields: newFields });
    };

    // Simple Move Up/Down since Drag & Drop needs extra libraries
    const moveField = (index: number, direction: 'up' | 'down') => {
        if (!editedSchema) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === editedSchema.fields.length - 1) return;

        const newFields = [...editedSchema.fields];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        const temp = newFields[index];
        newFields[index] = newFields[swapIndex];
        newFields[swapIndex] = temp;

        setEditedSchema({ ...editedSchema, fields: newFields });
    };

    /**
     * Restore the registry default for this module by deleting the tenant's
     * saved layout. Deleting rather than overwriting keeps the module tracking
     * future changes to the default.
     */
    const handleReset = async () => {
        const def = getDefaultSchema(selectedModule);
        if (!def) return;
        if (!window.confirm(t('schemaBuilder.resetConfirm', { module: def.moduleName }))) return;
        try {
            setIsResetting(true);
            setSaveMessage(null);
            await resetSchema(selectedModule);
            setEditedSchema(JSON.parse(JSON.stringify(def)));
            setSaveMessage({ type: 'success', text: t('schemaBuilder.resetDone') });
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (error) {
            const text = error instanceof Error ? error.message : t('schemaBuilder.resetFailed');
            setSaveMessage({ type: 'error', text });
        } finally {
            setIsResetting(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Schemas...</div>;

    // Every module the registry knows about, grouped. Built from the registry
    // rather than Object.keys(schemas) so a screen appears here even when this
    // tenant has never saved a layout for it — that was the reason the builder
    // only ever offered Retailers and Orders.
    const modulesByGroup = MODULE_GROUPS
        .map((group) => ({
            group,
            modules: Object.values(schemas)
                .filter((s) => getModuleDefinition(s.moduleId)?.group === group)
                .sort((a, b) => a.moduleName.localeCompare(b.moduleName)),
        }))
        .filter((g) => g.modules.length > 0);

    // Saved layouts whose module was retired from the registry: still listed so
    // an admin can find and reset them instead of them silently disappearing.
    const orphanModules = Object.values(schemas).filter((s) => !getModuleDefinition(s.moduleId));

    const activeDefinition = getModuleDefinition(selectedModule);
    const isCustomized = savedModuleIds.has(selectedModule);
    const addableFields = getAddableFields(
        selectedModule,
        (editedSchema?.fields ?? []).map((f) => f.id),
    );

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <LayoutTemplate size={32} />
                        UI Layout Builder
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Configure exactly what fields appear across your screens and tables.</p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <select
                        value={selectedModule}
                        onChange={(e) => setSelectedModule(e.target.value)}
                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', color: 'var(--text-primary)', minWidth: '15rem' }}
                    >
                        {modulesByGroup.map(({ group, modules }) => (
                            <optgroup key={group} label={t(`schemaBuilder.groups.${group}`, group)}>
                                {modules.map(mod => (
                                    <option key={mod.moduleId} value={mod.moduleId}>{mod.moduleName}</option>
                                ))}
                            </optgroup>
                        ))}
                        {orphanModules.length > 0 && (
                            <optgroup label={t('schemaBuilder.groups.Retired')}>
                                {orphanModules.map(mod => (
                                    <option key={mod.moduleId} value={mod.moduleId}>{mod.moduleName}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>

                    {isCustomized && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleReset}
                            disabled={isResetting || isSaving}
                            title={t('schemaBuilder.resetHint')}
                        >
                            {isResetting
                                ? t('schemaBuilder.resetting')
                                : <><RotateCcw size={18} /> {t('schemaBuilder.reset')}</>}
                        </button>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={isSaving || !editedSchema}
                    >
                        {isSaving ? 'Saving...' : <><Save size={18} /> Save Layout</>}
                    </button>
                </div>
            </div>

            {/* Which screens this layout drives, and whether it is still the
                shipped default. Without this an admin cannot tell that editing
                "Bills & Invoices" changes POS, Khata and B2B GST Invoice at once. */}
            {activeDefinition && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-base)', border: '1px solid var(--surface-border)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.2rem 0.6rem', borderRadius: '999px', background: isCustomized ? 'hsla(152, 60%, 40%, 0.15)' : 'var(--surface-border)', color: isCustomized ? 'var(--primary-light)' : 'var(--text-secondary)' }}>
                        {isCustomized ? t('schemaBuilder.customized') : t('schemaBuilder.usingDefault')}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {t('schemaBuilder.usedBy')}: <strong style={{ color: 'var(--text-primary)' }}>{activeDefinition.usedBy}</strong>
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {t('schemaBuilder.collection')}: <code>{activeDefinition.collection}</code>
                    </span>
                </div>
            )}

            {saveMessage && (
                <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: saveMessage.type === 'success' ? 'hsla(152, 60%, 40%, 0.1)' : 'hsla(0, 84%, 60%, 0.1)', color: saveMessage.type === 'success' ? 'var(--primary-light)' : 'var(--danger)' }}>
                    {saveMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    {saveMessage.text}
                </div>
            )}

            <div style={{ background: 'var(--surface-base)', borderRadius: '12px', border: '1px solid var(--surface-border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--surface-border)' }}>
                        <tr>
                            <th style={{ padding: '1rem', textAlign: 'left', width: '50px' }}>Ord</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Field ID</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Display Name</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Type</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Required</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Editable</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>{t('schemaBuilder.showsOn')}</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {editedSchema?.fields.map((field, index) => (
                            <tr key={field.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                <td style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                                    <button onClick={() => moveField(index, 'up')} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1 }}>▲</button>
                                    <span style={{ fontSize: '0.875rem' }}>{index + 1}</span>
                                    <button onClick={() => moveField(index, 'down')} disabled={index === editedSchema.fields.length - 1} style={{ background: 'none', border: 'none', cursor: index === editedSchema.fields.length - 1 ? 'not-allowed' : 'pointer', opacity: index === editedSchema.fields.length - 1 ? 0.3 : 1 }}>▼</button>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    {isCustomField(field) && (
                                        <span title={t('schemaBuilder.customFieldHint')} style={{ display: 'inline-block', marginBottom: '0.3rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'hsla(210, 90%, 55%, 0.15)', color: 'var(--text-secondary)' }}>
                                            {t('schemaBuilder.customBadge')}
                                        </span>
                                    )}
                                    <input
                                        type="text"
                                        value={field.id}
                                        onChange={(e) => updateField(index, 'id', e.target.value)}
                                        disabled={field.systemOnly}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--surface-border)', background: field.systemOnly ? 'var(--surface-raised)' : 'var(--surface-base)', color: 'var(--text-primary)' }}
                                    />
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <input
                                        type="text"
                                        value={field.label}
                                        onChange={(e) => updateField(index, 'label', e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                                    />
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <select
                                        value={field.type}
                                        onChange={(e) => updateField(index, 'type', e.target.value as FieldType)}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="text">Text</option>
                                        <option value="number">Number</option>
                                        <option value="email">Email</option>
                                        <option value="phone">Phone</option>
                                        <option value="date">Date</option>
                                        <option value="select">Dropdown</option>
                                        <option value="boolean">Checkbox</option>
                                        <option value="currency">Currency</option>
                                    </select>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <input type="checkbox" checked={field.required} onChange={(e) => updateField(index, 'required', e.target.checked)} />
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <input type="checkbox" checked={field.editable} onChange={(e) => updateField(index, 'editable', e.target.checked)} />
                                </td>
                                <td style={{ padding: '0.5rem 1rem' }}>
                                    {/* One toggle per surface this module can actually
                                        reach. A products column offers POS and Stock
                                        Report; a retailers column offers Worklist —
                                        because those screens can resolve that entity. */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        {getAvailableSurfaces(selectedModule).map((surface) => {
                                            const on = isOnSurface(field, surface);
                                            return (
                                                <label
                                                    key={surface}
                                                    title={t(`schemaBuilder.surfaces.${surface}`)}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '999px', cursor: 'pointer', border: '1px solid var(--surface-border)', background: on ? 'hsla(152, 60%, 40%, 0.15)' : 'transparent', color: on ? 'var(--primary-light)' : 'var(--text-secondary)' }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={on}
                                                        onChange={(e) => toggleSurface(index, surface, e.target.checked)}
                                                        style={{ margin: 0 }}
                                                    />
                                                    {t(`schemaBuilder.surfaces.${surface}`)}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <button
                                        onClick={() => removeField(index)}
                                        disabled={field.systemOnly}
                                        style={{ background: 'none', border: 'none', color: field.systemOnly ? 'gray' : 'var(--danger)', cursor: field.systemOnly ? 'not-allowed' : 'pointer' }}
                                        title={field.systemOnly ? "System fields cannot be deleted" : "Remove Field"}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ padding: '1rem', borderTop: '1px solid var(--surface-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Real fields on this collection that are not on the layout yet.
                        Picking one binds the correct id, type and label; the custom
                        button remains for keys the registry does not know. */}
                    <select
                        value=""
                        onChange={(e) => addKnownField(e.target.value)}
                        disabled={addableFields.length === 0}
                        style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', color: 'var(--text-primary)', minWidth: '16rem' }}
                    >
                        <option value="">
                            {addableFields.length === 0
                                ? t('schemaBuilder.allFieldsAdded')
                                : t('schemaBuilder.addExistingField')}
                        </option>
                        {addableFields.map((field) => (
                            <option key={field.id} value={field.id}>
                                {field.label} — {field.id}
                            </option>
                        ))}
                    </select>

                    <button className="btn btn-secondary" onClick={addCustomField}>
                        <Plus size={18} /> {t('schemaBuilder.addCustomField')}
                    </button>

                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {t('schemaBuilder.addFieldHint')}
                    </span>
                </div>
            </div>
        </div>
    );
}
