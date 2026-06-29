import { isNumericSensor } from '$lib/entity-match';
import type { DeviceSnapshot, DeviceUiConfig, DeviceUiEntity, DeviceUiGroup, EntityConfig, Snapshot } from '$lib/server/mqtt/types';

export type DeviceSettingsSectionId = 'controls' | 'updates' | 'alerts' | 'calibration' | 'maintenance' | 'diagnostics' | 'other';

export const DEVICE_SETTINGS_SECTIONS: Array<{ id: DeviceSettingsSectionId; title: string }> = [
  { id: 'controls', title: 'Controls' },
  { id: 'updates', title: 'Updates' },
  { id: 'alerts', title: 'Alerts' },
  { id: 'calibration', title: 'Calibration' },
  { id: 'maintenance', title: 'Maintenance' },
  { id: 'diagnostics', title: 'Diagnostics' },
  { id: 'other', title: 'Other' }
];

export interface PresentedEntity {
  entity: EntityConfig;
  label: string;
  order: number;
  groupId?: string;
  role?: string;
}

export interface PresentedSection {
  id: string;
  title: string;
  order: number;
  defaultOpen: boolean;
  entries: PresentedEntity[];
  deviceSettingsSection: DeviceSettingsSectionId;
}

export interface DashboardPresentation {
  metrics: PresentedEntity[];
  quickControls: PresentedEntity[];
  cameras: PresentedCamera[];
}

export interface PresentedCamera {
  entry: PresentedEntity;
  quickControls: PresentedEntity[];
}

export interface DeviceSettingsPanel {
  id: DeviceSettingsSectionId;
  title: string;
  entryCount: number;
  groups: PresentedSection[];
}

function entityMatchKey(entity: EntityConfig): string {
  return `${entity.component}:${entity.objectId ?? entity.id}`;
}

function metadataByEntity(config: DeviceUiConfig | undefined): Map<string, DeviceUiEntity> {
  const metadata = new Map<string, DeviceUiEntity>();
  for (const entry of config?.entities ?? []) metadata.set(`${entry.component}:${entry.objectId}`, entry);
  return metadata;
}

function groupById(config: DeviceUiConfig | undefined): Map<string, DeviceUiGroup> {
  const groups = new Map<string, DeviceUiGroup>();
  for (const group of config?.groups ?? []) groups.set(group.id, group);
  return groups;
}

function toPresentedEntity(entity: EntityConfig, metadata?: DeviceUiEntity): PresentedEntity {
  return {
    entity,
    label: metadata?.label ?? entity.name,
    order: metadata?.order ?? 0,
    groupId: metadata?.group,
    role: metadata?.role
  };
}

function sortPresented(a: PresentedEntity, b: PresentedEntity): number {
  return a.order - b.order || a.label.localeCompare(b.label);
}

function sortSections(a: PresentedSection, b: PresentedSection): number {
  return a.order - b.order || a.title.localeCompare(b.title);
}

function isDiagnostic(entity: EntityConfig): boolean {
  return entity.entityCategory === 'diagnostic' || entity.objectId === 'uptime' || entity.objectId === 'wifi_signal';
}

function normalize(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function knownSettingsSection(value: string | undefined): DeviceSettingsSectionId | null {
  return DEVICE_SETTINGS_SECTIONS.some((section) => section.id === value) ? (value as DeviceSettingsSectionId) : null;
}

function inferDeviceSettingsSection(group: DeviceUiGroup): DeviceSettingsSectionId {
  const explicit = knownSettingsSection(group.deviceSettingsSection);
  if (explicit) return explicit;

  const value = `${normalize(group.id)}_${normalize(group.title)}`;
  if (value.includes('threshold') || value.includes('alert')) return 'alerts';
  if (value.includes('calibration') || /(^|_)cal($|_)/.test(value)) return 'calibration';
  if (value.includes('maintenance') || value.includes('factory_reset') || value.includes('restart')) return 'maintenance';
  if (value.includes('diagnostic')) return 'diagnostics';
  if (value.includes('control') || value.includes('temp_comp') || value.includes('thermal') || value.includes('compensation')) {
    return 'controls';
  }
  return 'other';
}

function deviceEntities(snapshot: Snapshot, device: DeviceSnapshot): EntityConfig[] {
  const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  return device.entityIds
    .map((id) => entitiesById.get(id))
    .filter((entity): entity is EntityConfig => Boolean(entity))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function hasCameraFrameSource(entity: EntityConfig): boolean {
  return Boolean(entity.imageUrl || entity.imagePath);
}

function selectCameras(entities: EntityConfig[], entityMetadata?: Map<string, DeviceUiEntity>): PresentedEntity[] {
  return entities
    .filter((entity) => entity.component === 'camera' && hasCameraFrameSource(entity))
    .map((entity) => toPresentedEntity(entity, entityMetadata?.get(entityMatchKey(entity))))
    .sort(sortPresented);
}

function fallbackMetrics(entities: EntityConfig[]): PresentedEntity[] {
  return entities
    .filter((entity) => !entity.writable && !entity.dangerous && !isDiagnostic(entity) && entity.component !== 'camera')
    .map((entity) => toPresentedEntity(entity))
    .sort(sortPresented);
}

export function dashboardPresentation(snapshot: Snapshot, device: DeviceSnapshot): DashboardPresentation {
  const entities = deviceEntities(snapshot, device);
  const config = snapshot.uiConfigs[device.nodeId];
  if (!config) {
    return {
      metrics: fallbackMetrics(entities),
      quickControls: [],
      cameras: selectCameras(entities).map((entry) => ({ entry, quickControls: [] }))
    };
  }

  const entityMetadata = metadataByEntity(config);
  const groups = groupById(config);
  const cameraEntries = selectCameras(entities, entityMetadata);
  const cameraGroupIds = new Set(cameraEntries.map((entry) => entry.groupId).filter((id): id is string => Boolean(id)));

  const metrics = entities
    .map((entity) => {
      const metadata = entityMetadata.get(entityMatchKey(entity));
      const group = metadata ? groups.get(metadata.group) : undefined;
      const metric = metadata?.role === 'metric' || group?.variant === 'metrics';
      return metadata && metric ? toPresentedEntity(entity, metadata) : null;
    })
    .filter((entry): entry is PresentedEntity => Boolean(entry))
    .sort(sortPresented);

  const quickControls = entities
    .map((entity) => {
      const metadata = entityMetadata.get(entityMatchKey(entity));
      const attachedToCamera = Boolean(metadata?.group && cameraGroupIds.has(metadata.group));
      return entity.writable && metadata?.role === 'quick-control' && !attachedToCamera ? toPresentedEntity(entity, metadata) : null;
    })
    .filter((entry): entry is PresentedEntity => Boolean(entry))
    .sort(sortPresented);

  const cameraControls = entities
    .map((entity) => {
      const metadata = entityMetadata.get(entityMatchKey(entity));
      return entity.writable && metadata?.role === 'quick-control' && metadata.group && cameraGroupIds.has(metadata.group)
        ? toPresentedEntity(entity, metadata)
        : null;
    })
    .filter((entry): entry is PresentedEntity => Boolean(entry))
    .sort(sortPresented);

  const controlsByGroup = new Map<string, PresentedEntity[]>();
  for (const control of cameraControls) {
    const groupId = control.groupId ?? '';
    controlsByGroup.set(groupId, [...(controlsByGroup.get(groupId) ?? []), control]);
  }
  const cameras = cameraEntries.map((entry) => ({
    entry,
    quickControls: controlsByGroup.get(entry.groupId ?? '') ?? []
  }));

  return { metrics, quickControls, cameras };
}

/**
 * The numeric dashboard metrics a device exposes (firmware `role:metric`), optionally
 * with a label prefix stripped. Single source for both the WATER/CLIMATE readouts
 * (`routes/+page.svelte`) and their trend series (`server/influx/trend-domains.ts`), so
 * the chartable-metric rule can't drift between them.
 */
export function presentedNumericMetrics(
  snapshot: Snapshot,
  device: DeviceSnapshot,
  stripPrefix = ''
): PresentedEntity[] {
  return dashboardPresentation(snapshot, device)
    .metrics.filter((m) => isNumericSensor(m.entity))
    .map((m) =>
      stripPrefix && m.label.startsWith(stripPrefix) ? { ...m, label: m.label.slice(stripPrefix.length) } : m
    );
}

function groupSectionsByPanel(sections: PresentedSection[]): DeviceSettingsPanel[] {
  return DEVICE_SETTINGS_SECTIONS.map((panel) => {
    const groups = sections.filter((section) => section.deviceSettingsSection === panel.id).sort(sortSections);
    return {
      ...panel,
      groups,
      entryCount: groups.reduce((count, group) => count + group.entries.length, 0)
    };
  }).filter((panel) => panel.entryCount > 0);
}

function fallbackSettingsPresentation(entities: EntityConfig[]): DeviceSettingsPanel[] {
  const groups = ([
    {
      id: 'controls',
      title: 'Controls',
      order: 10,
      defaultOpen: true,
      deviceSettingsSection: 'controls',
      entries: entities
        .filter((entity) => entity.writable && !entity.dangerous)
        .map((entity) => toPresentedEntity(entity))
        .sort(sortPresented)
    },
    {
      id: 'maintenance',
      title: 'Maintenance',
      order: 80,
      defaultOpen: false,
      deviceSettingsSection: 'maintenance',
      entries: entities
        .filter((entity) => entity.dangerous)
        .map((entity) => toPresentedEntity(entity))
        .sort(sortPresented)
    },
    {
      id: 'diagnostics',
      title: 'Diagnostics',
      order: 90,
      defaultOpen: false,
      deviceSettingsSection: 'diagnostics',
      entries: entities
        .filter((entity) => isDiagnostic(entity))
        .map((entity) => toPresentedEntity(entity))
        .sort(sortPresented)
    }
  ] satisfies PresentedSection[]).filter((section) => section.entries.length > 0);

  return groupSectionsByPanel(groups);
}

export function deviceSettingsPresentation(snapshot: Snapshot, device: DeviceSnapshot): DeviceSettingsPanel[] {
  const entities = deviceEntities(snapshot, device);
  const settingsEntities = entities.filter((entity) => entity.component !== 'camera');
  const config = snapshot.uiConfigs[device.nodeId];
  if (!config) return fallbackSettingsPresentation(settingsEntities);

  const entityMetadata = metadataByEntity(config);
  const groups = groupById(config);
  const consumed = new Set<string>();
  const dashboardEntityIds = new Set(
    settingsEntities
      .map((entity) => {
        const metadata = entityMetadata.get(entityMatchKey(entity));
        const group = metadata ? groups.get(metadata.group) : undefined;
        return group?.surface === 'dashboard' ? entity.id : null;
      })
      .filter((id): id is string => Boolean(id))
  );

  const sections = [...groups.values()]
    .filter((group) => group.variant !== 'metrics')
    .filter((group) => group.surface !== 'dashboard')
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((group) => {
      const entries = settingsEntities
        .map((entity) => {
          const metadata = entityMetadata.get(entityMatchKey(entity));
          return metadata?.group === group.id ? toPresentedEntity(entity, metadata) : null;
        })
        .filter((entry): entry is PresentedEntity => Boolean(entry))
        .sort(sortPresented);

      for (const entry of entries) consumed.add(entry.entity.id);

      return {
        id: group.id,
        title: group.title,
        order: group.order,
        defaultOpen: group.defaultOpen,
        deviceSettingsSection: inferDeviceSettingsSection(group),
        entries
      };
    })
    .filter((section) => section.entries.length > 0);

  const metricEntityIds = new Set(
    settingsEntities
      .map((entity) => {
        const metadata = entityMetadata.get(entityMatchKey(entity));
        const group = metadata ? groups.get(metadata.group) : undefined;
        return metadata?.role === 'metric' || group?.variant === 'metrics' ? entity.id : null;
      })
      .filter((id): id is string => Boolean(id))
  );

  const remaining = settingsEntities.filter(
    (entity) => !consumed.has(entity.id) && !metricEntityIds.has(entity.id) && !dashboardEntityIds.has(entity.id)
  );
  const diagnostics = remaining.filter(isDiagnostic).map((entity) => toPresentedEntity(entity)).sort(sortPresented);
  const other = remaining.filter((entity) => !isDiagnostic(entity)).map((entity) => toPresentedEntity(entity)).sort(sortPresented);

  if (diagnostics.length > 0) {
    sections.push({
      id: 'diagnostics_fallback',
      title: 'Diagnostics',
      order: 900,
      defaultOpen: false,
      deviceSettingsSection: 'diagnostics',
      entries: diagnostics
    });
  }

  if (other.length > 0) {
    sections.push({
      id: 'other',
      title: 'Other',
      order: 990,
      defaultOpen: false,
      deviceSettingsSection: 'other',
      entries: other
    });
  }

  return groupSectionsByPanel(sections);
}
