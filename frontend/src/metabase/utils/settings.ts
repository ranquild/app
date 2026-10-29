import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
  SettingKey,
  Settings,
} from "metabase-types/api";

type SettingListener = (value: unknown) => void;

class MetabaseSettings {
  _settings: Partial<EnterpriseSettings>;
  _listeners: Partial<{ [key: string]: SettingListener[] }> = {};

  constructor(settings: Partial<EnterpriseSettings> = {}) {
    this._settings = settings;
  }

  /**
   * @deprecated use getSetting(state, key)
   */
  get<T extends EnterpriseSettingKey>(key: T): Partial<EnterpriseSettings>[T] {
    return this._settings[key];
  }

  /**
   * @deprecated set setting values in the redux store
   */
  set<T extends EnterpriseSettingKey>(key: T, value: EnterpriseSettings[T]) {
    if (this._settings[key] !== value) {
      this._settings[key] = value;
      const listeners = this._listeners[key];

      if (!listeners) {
        return;
      }

      for (const listener of listeners) {
        setTimeout(() => listener(value));
      }
    }
  }

  /**
   * @deprecated set setting values in the redux store
   */
  setAll(settings: Settings) {
    // Unjustified type cast. FIXME
    const keys = Object.keys(settings) as SettingKey[];

    keys.forEach((key) => {
      this.set(key, settings[key]);
    });
  }

  /**
   * @deprecated call appropriate actions when modifying the setting
   */
  on(key: EnterpriseSettingKey, callback: SettingListener) {
    this._listeners[key] = this._listeners[key] || [];
    this._listeners[key].push(callback);
  }

  /**
   * @deprecated remove an event listener
   */
  off(key: EnterpriseSettingKey, callback: SettingListener) {
    this._listeners[key] =
      this._listeners[key]?.filter((c) => c !== callback) || [];
  }
}

const settings = new MetabaseSettings();

export default settings;
