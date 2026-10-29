import MetabaseSettings from "metabase/utils/settings";

function getTimeStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.time_style;
}

const TIME_FORMAT_24_HOUR = "HH:mm";

export function has24HourModeSetting() {
  const timeStyle = getTimeStyleFromSettings();
  return timeStyle === TIME_FORMAT_24_HOUR;
}
