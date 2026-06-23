// ============================================================
// Component: AdminSettings
// Configuration UI for auto-action thresholds and settings
// Sprint 5: Admin Panel
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

type AdminSettingsState = Record<string, boolean | number | string>;

const DEFAULT_ADMIN_AUTO_SETTINGS: AdminSettingsState = {
  auto_cancel_enabled: true,
  min_players_threshold: 4,
  auto_cancel_hours_before: 2,
  auto_complete_enabled: true,
  checkin_percentage_required: 50,
  auto_complete_hours_after: 1,
  refund_max_retry_attempts: 3,
  refund_retry_delay_minutes: 30,
  auto_refund_on_cancel: true,
  send_reminders_enabled: true,
  reminder_minutes_before: 60,
  archive_days: 90,
};

function parseSettingValue(value: unknown): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  if (value !== "" && value !== null && Number.isFinite(asNumber)) return asNumber;
  return String(value ?? "");
}

/**
 * Admin settings component
 * Allows configuration of auto-match lifecycle settings
 */
export function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettingsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<AdminSettingsState>(DEFAULT_ADMIN_AUTO_SETTINGS);

  /**
   * Fetch current settings
   */
  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await (supabase as any).rpc(
        'get_admin_auto_settings'
      );

      if (fetchError) {
        const { data: rows, error: tableError } = await (supabase as any)
          .from('admin_auto_settings')
          .select('setting_key, value');
        if (tableError) throw fetchError;
        const mapped = Object.fromEntries((rows ?? []).map((r: any) => [r.setting_key, parseSettingValue(r.value)]));
        const next = { ...DEFAULT_ADMIN_AUTO_SETTINGS, ...mapped };
        setSettings(next);
        setLocalSettings(next);
        return;
      }

      if (data) {
        const next = { ...DEFAULT_ADMIN_AUTO_SETTINGS, ...(data as any) };
        setSettings(next);
        setLocalSettings(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Save settings
   */
  const saveSettings = useCallback(async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      // Save each setting
      for (const [key, value] of Object.entries(localSettings)) {
        if (value !== undefined && settings && settings[key] !== value) {
          const { error: updateError } = await (supabase as any).rpc(
            'update_admin_auto_setting',
            {
              p_setting_key: key,
              p_value: String(value),
            }
          );

          if (updateError) {
            const { error: upsertError } = await (supabase as any)
              .from('admin_auto_settings')
              .upsert(
                { setting_key: key, value: String(value), updated_at: new Date().toISOString() },
                { onConflict: 'setting_key' }
              );
            if (upsertError) throw updateError;
          }
        }
      }

      setSettings(localSettings);
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }, [settings, localSettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (key: string, value: any) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Auto-Action Settings</h2>
        <p className="text-gray-600 mt-1">Configure automatic match lifecycle actions</p>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Settings Form */}
      {settings && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Auto-Cancel Settings */}
          <div className="space-y-4">
            <div className="border-b pb-4">
              <h3 className="font-semibold text-lg">Auto-Cancel Rules</h3>
              <p className="text-sm text-gray-600 mt-1">
                Automatically cancel matches that don't meet requirements
              </p>
            </div>

            <SettingToggle
              label="Enable Auto-Cancel"
              description="Automatically cancel matches with insufficient players"
              value={localSettings.auto_cancel_enabled ?? false}
              onChange={(v) => handleChange('auto_cancel_enabled', v)}
            />

            <SettingInput
              label="Minimum Players for Auto-Cancel"
              description="Cancel if fewer than this many players have joined"
              value={localSettings.min_players_threshold ?? 4}
              type="number"
              min={1}
              max={22}
              onChange={(v) => handleChange('min_players_threshold', v)}
            />

            <SettingInput
              label="Hours Before Match to Auto-Cancel"
              description="Cancel matches if they don't meet minimum players this many hours before start"
              value={localSettings.auto_cancel_hours_before ?? 2}
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              onChange={(v) => handleChange('auto_cancel_hours_before', v)}
            />
          </div>

          {/* Auto-Complete Settings */}
          <div className="space-y-4">
            <div className="border-t border-b py-4">
              <h3 className="font-semibold text-lg">Auto-Complete Rules</h3>
              <p className="text-sm text-gray-600 mt-1">
                Automatically complete matches after the booking period ends
              </p>
            </div>

            <SettingToggle
              label="Enable Auto-Complete"
              description="Automatically mark matches as complete after booking period"
              value={localSettings.auto_complete_enabled ?? true}
              onChange={(v) => handleChange('auto_complete_enabled', v)}
            />

            <SettingInput
              label="Checkin Percentage Required (%)"
              description="Require this % of players to check in before auto-completing (safety guard)"
              value={localSettings.checkin_percentage_required ?? 50}
              type="number"
              min={0}
              max={100}
              onChange={(v) => handleChange('checkin_percentage_required', v)}
            />

            <SettingInput
              label="Hours After Match to Complete"
              description="Complete matches this many hours after booking period ends"
              value={localSettings.auto_complete_hours_after ?? 1}
              type="number"
              min={0}
              max={24}
              onChange={(v) => handleChange('auto_complete_hours_after', v)}
            />
          </div>

          {/* Refund Settings */}
          <div className="space-y-4">
            <div className="border-t border-b py-4">
              <h3 className="font-semibold text-lg">Refund Processing</h3>
              <p className="text-sm text-gray-600 mt-1">
                Configure refund retry and processing settings
              </p>
            </div>

            <SettingInput
              label="Refund Retry Attempts"
              description="Maximum number of times to retry failed refunds"
              value={localSettings.refund_max_retry_attempts ?? 3}
              type="number"
              min={1}
              max={10}
              onChange={(v) => handleChange('refund_max_retry_attempts', v)}
            />

            <SettingInput
              label="Refund Retry Delay (minutes)"
              description="Wait this many minutes between retry attempts"
              value={localSettings.refund_retry_delay_minutes ?? 30}
              type="number"
              min={1}
              max={1440}
              onChange={(v) => handleChange('refund_retry_delay_minutes', v)}
            />

            <SettingToggle
              label="Auto Refund on Cancel"
              description="Automatically process refunds when matches are cancelled"
              value={localSettings.auto_refund_on_cancel ?? true}
              onChange={(v) => handleChange('auto_refund_on_cancel', v)}
            />
          </div>

          {/* Notification Settings */}
          <div className="space-y-4">
            <div className="border-t border-b py-4">
              <h3 className="font-semibold text-lg">Notifications</h3>
              <p className="text-sm text-gray-600 mt-1">
                Configure when notifications are sent
              </p>
            </div>

            <SettingToggle
              label="Send Reminder Notifications"
              description="Send reminders to players before matches"
              value={localSettings.send_reminders_enabled ?? true}
              onChange={(v) => handleChange('send_reminders_enabled', v)}
            />

            <SettingInput
              label="Reminder Time (minutes before)"
              description="Send reminder this many minutes before match start"
              value={localSettings.reminder_minutes_before ?? 60}
              type="number"
              min={5}
              max={1440}
              onChange={(v) => handleChange('reminder_minutes_before', v)}
            />
          </div>

          {/* Cleanup Settings */}
          <div className="space-y-4">
            <div className="border-t border-b py-4">
              <h3 className="font-semibold text-lg">Data Cleanup</h3>
              <p className="text-sm text-gray-600 mt-1">
                Configure automatic data retention and cleanup
              </p>
            </div>

            <SettingInput
              label="Archive Matches After (days)"
              description="Move old matches to archive after this many days"
              value={localSettings.archive_days ?? 90}
              type="number"
              min={7}
              max={365}
              onChange={(v) => handleChange('archive_days', v)}
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-6 border-t">
            <button
              onClick={() => setLocalSettings(settings)}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <Loader className="w-4 h-4 animate-spin" />}
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Toggle setting component
 */
function SettingToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <label className="block font-medium">{label}</label>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          value ? 'bg-blue-600' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            value ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

/**
 * Input setting component
 */
function SettingInput({
  label,
  description,
  value,
  onChange,
  type = 'text',
  min,
  max,
  step,
}: {
  label: string;
  description: string;
  value: any;
  onChange: (value: any) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block font-medium">{label}</label>
      <p className="text-sm text-gray-600 mb-2">{description}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => {
          const val = type === 'number' ? parseFloat(e.target.value) : e.target.value;
          onChange(val);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
