import type { Snapshot } from '../../src/lib/server/mqtt/types';

/**
 * Sanitized snapshot captured from the live daniel-home site (~130 entities, the
 * real Atlas hydro kit + AtomS3U rig). Used by the Playwright screenshot spec so
 * the generated screenshots reflect production. Sanitized: LAN IPs -> 192.0.2.x,
 * MACs + wifi SSID/BSSID redacted, entity.raw stripped. Re-capture with
 * scripts/capture-fixture.sh.
 */
export const liveSnapshot = {
  "site": "daniel-home",
  "topicPrefix": "grow/daniel-home",
  "discoveryPrefix": "grow/daniel-home/_discovery",
  "generatedAt": "2026-06-29T10:05:27.283Z",
  "broker": {
    "connected": true,
    "connecting": false,
    "error": null,
    "lastConnectedAt": "2026-06-29T08:55:35.095Z",
    "lastMessageAt": "2026-06-29T10:05:26.725Z"
  },
  "devices": [
    {
      "id": "fedcba987654",
      "nodeId": "atlas-hydro-monitor",
      "name": "Atlas Hydro Monitor",
      "manufacturer": "stackdrift",
      "model": "atlas-hydro-kit",
      "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)",
      "availability": "online",
      "entityIds": [
        "atlas_hydro_monitor_espbuttoncheck_firmware_update",
        "espsensorconnected_bssid",
        "espsensorconnected_ssid",
        "espsensordns_address",
        "espbuttonec_cal_high_5000_s_cm",
        "espbuttonec_cal_low_1413_s_cm",
        "espswitchec_calibration_mode",
        "espsensorec_calibration_status",
        "espselectec_cell_constant",
        "espbuttonec_clear_calibration",
        "espsensorec_current_command",
        "espbuttonec_dry_calibration",
        "espbuttonec_factory_reset",
        "espsensorec_firmware_version",
        "espsensorec_last_command",
        "espsensorec_next_command",
        "espsensorec_queue_size",
        "espsensorec_reset_reason",
        "espnumberec_tds_conversion_factor",
        "espswitchec_temperature_compensation",
        "espsensorec_temperature_compensation",
        "espsensorec_voltage",
        "espswitchenable_aux_circuit",
        "espswitchenable_ec_circuit",
        "espswitchenable_ph_circuit",
        "espswitchenable_rtd_circuit",
        "espsensoresp_version",
        "atlas_hydro_monitor_espupdatefirmware_update",
        "espbinary_sensorhome_assistant_api_status",
        "atlas_hydro_monitor_espsensorip_address",
        "espsensormac_address",
        "espbuttonorp_calibration_400_mv",
        "espsensororp_calibration_status",
        "espbuttonorp_clear_calibration",
        "espsensororp_current_command",
        "espswitchorp_extended_scale",
        "espbuttonorp_factory_reset",
        "espsensororp_firmware_version",
        "espsensororp_last_command",
        "espsensororp_next_command",
        "espsensororp_queue_size",
        "espsensororp_reset_reason",
        "espsensororp_voltage",
        "espsensorph_acid_slope_quality",
        "espsensorph_alkaline_slope_quality",
        "espsensorph_asymmetry_potential",
        "espbuttonph_cal_high_10_00",
        "espbuttonph_cal_low_4_00",
        "espbuttonph_cal_mid_7_00",
        "espswitchph_calibration_mode",
        "espsensorph_calibration_status",
        "espbuttonph_clear_calibration",
        "espsensorph_current_command",
        "espbuttonph_factory_reset",
        "espsensorph_firmware_version",
        "espsensorph_last_command",
        "espsensorph_next_command",
        "espsensorph_queue_size",
        "espsensorph_reset_reason",
        "espswitchph_temperature_compensation",
        "espsensorph_temperature_compensation",
        "espsensorph_voltage",
        "espbuttonrefresh_circuit_state",
        "espbuttonrestart_device",
        "espbuttonrtd_calibration_25_0_c",
        "espsensorrtd_calibration_status",
        "espbuttonrtd_clear_calibration",
        "espsensorrtd_current_command",
        "espbuttonrtd_factory_reset",
        "espsensorrtd_firmware_version",
        "espsensorrtd_last_command",
        "espsensorrtd_next_command",
        "espsensorrtd_queue_size",
        "espsensorrtd_reset_reason",
        "espsensorrtd_voltage",
        "atlas_hydro_monitor_espsensoruptime",
        "espsensorwater_ec",
        "espsensorwater_orp",
        "espsensorwater_ph",
        "espsensorwater_tds",
        "espsensorwater_temperature",
        "atlas_hydro_monitor_espsensorwifi_signal"
      ]
    },
    {
      "id": "0123456789ab",
      "nodeId": "atoms3u-sensor-rig",
      "name": "AtomS3U Sensor Rig",
      "manufacturer": "stackdrift",
      "model": "atoms3u-sensor-rig",
      "swVersion": "dev (ESPHome 2026.5.1)",
      "availability": "online",
      "entityIds": [
        "espsensorbarometric_pressure",
        "espsensorbps_temperature",
        "espbuttoncheck_firmware_update",
        "espsensorco2",
        "espbinary_sensorco2_high_alert",
        "espnumberco2_high_threshold",
        "espbinary_sensorco2_low_alert",
        "espnumberco2_low_threshold",
        "espsensorco2_moving_average",
        "espsensordaily_max_co2",
        "espsensordaily_max_temperature",
        "espsensordaily_min_temperature",
        "espupdatefirmware_update",
        "espsensorhumidity",
        "espbinary_sensorhumidity_high_alert",
        "espnumberhumidity_high_threshold",
        "espbinary_sensorhumidity_low_alert",
        "espnumberhumidity_low_threshold",
        "espsensorilluminance",
        "espsensorip_address",
        "espsensormlx90640_max_temp",
        "espsensormlx90640_mean_temp",
        "espsensormlx90640_min_temp",
        "espsensormlx90640_roi_max_temp",
        "espsensormlx90640_roi_mean_temp",
        "espsensormlx90640_roi_min_temp",
        "espbuttonrestart",
        "espnumberroi_center_column",
        "espnumberroi_center_row",
        "espswitchroi_enabled",
        "espnumberroi_size",
        "espsensortemperature",
        "espbinary_sensortemperature_high_alert",
        "espnumbertemperature_high_threshold",
        "espbinary_sensortemperature_low_alert",
        "espnumbertemperature_low_threshold",
        "espsensortemperature_moving_average",
        "atoms3u_sensor_rig_thermal_camera",
        "espselectthermal_color_palette",
        "espswitchthermal_overlay_enable",
        "espnumberthermal_alarm_high_threshold",
        "espnumberthermal_alarm_low_threshold",
        "espbinary_sensorthermal_alarm",
        "espswitchthermal_buzzer_enabled",
        "espbuttonthermal_alarm_test",
        "espnumberthermal_update_interval",
        "espsensoruptime",
        "espsensorvpd",
        "espbinary_sensorvpd_high_alert",
        "espnumbervpd_high_threshold",
        "espbinary_sensorvpd_low_alert",
        "espnumbervpd_low_threshold",
        "espsensorwifi_signal"
      ]
    }
  ],
  "entities": [
    {
      "id": "espsensorbarometric_pressure",
      "component": "sensor",
      "name": "Barometric Pressure",
      "uniqueId": "ESPsensorbarometric_pressure",
      "objectId": "barometric_pressure",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/barometric_pressure/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "hPa",
      "deviceClass": "pressure",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorbps_temperature",
      "component": "sensor",
      "name": "BPS Temperature",
      "uniqueId": "ESPsensorbps_temperature",
      "objectId": "bps_temperature",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/bps_temperature/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttoncheck_firmware_update",
      "component": "button",
      "name": "Check Firmware Update",
      "uniqueId": "ESPbuttoncheck_firmware_update",
      "objectId": "check_firmware_update",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/button/check_firmware_update/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "atlas_hydro_monitor_espbuttoncheck_firmware_update",
      "component": "button",
      "name": "Check Firmware Update",
      "uniqueId": "ESPbuttoncheck_firmware_update",
      "objectId": "check_firmware_update",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/check_firmware_update/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorco2",
      "component": "sensor",
      "name": "CO2",
      "uniqueId": "ESPsensorco2",
      "objectId": "co2",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/co2/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "ppm",
      "deviceClass": "carbon_dioxide",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:molecule-co2",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbinary_sensorco2_high_alert",
      "component": "binary_sensor",
      "name": "CO2 High Alert",
      "uniqueId": "ESPbinary_sensorco2_high_alert",
      "objectId": "co2_high_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/co2_high_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumberco2_high_threshold",
      "component": "number",
      "name": "CO2 High Threshold",
      "uniqueId": "ESPnumberco2_high_threshold",
      "objectId": "co2_high_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/co2_high_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/co2_high_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "ppm",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 500,
      "max": 2000,
      "step": 50,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbinary_sensorco2_low_alert",
      "component": "binary_sensor",
      "name": "CO2 Low Alert",
      "uniqueId": "ESPbinary_sensorco2_low_alert",
      "objectId": "co2_low_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/co2_low_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumberco2_low_threshold",
      "component": "number",
      "name": "CO2 Low Threshold",
      "uniqueId": "ESPnumberco2_low_threshold",
      "objectId": "co2_low_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/co2_low_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/co2_low_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "ppm",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 400,
      "max": 1000,
      "step": 50,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorco2_moving_average",
      "component": "sensor",
      "name": "CO2 Moving Average",
      "uniqueId": "ESPsensorco2_moving_average",
      "objectId": "co2_moving_average",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/co2_moving_average/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorconnected_bssid",
      "component": "sensor",
      "name": "Connected BSSID",
      "uniqueId": "ESPsensorconnected_bssid",
      "objectId": "connected_bssid",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/connected_bssid/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorconnected_ssid",
      "component": "sensor",
      "name": "Connected SSID",
      "uniqueId": "ESPsensorconnected_ssid",
      "objectId": "connected_ssid",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/connected_ssid/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensordaily_max_co2",
      "component": "sensor",
      "name": "Daily Max CO2",
      "uniqueId": "ESPsensordaily_max_co2",
      "objectId": "daily_max_co2",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/daily_max_co2/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensordaily_max_temperature",
      "component": "sensor",
      "name": "Daily Max Temperature",
      "uniqueId": "ESPsensordaily_max_temperature",
      "objectId": "daily_max_temperature",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/daily_max_temperature/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensordaily_min_temperature",
      "component": "sensor",
      "name": "Daily Min Temperature",
      "uniqueId": "ESPsensordaily_min_temperature",
      "objectId": "daily_min_temperature",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/daily_min_temperature/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensordns_address",
      "component": "sensor",
      "name": "DNS Address",
      "uniqueId": "ESPsensordns_address",
      "objectId": "dns_address",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/dns_address/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonec_cal_high_5000_s_cm",
      "component": "button",
      "name": "EC Cal High (5000 µS⁄cm)",
      "uniqueId": "ESPbuttonec_cal_high__5000___s___cm_",
      "objectId": "ec_cal_high__5000___s___cm_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ec_cal_high__5000___s___cm_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonec_cal_low_1413_s_cm",
      "component": "button",
      "name": "EC Cal Low (1413 µS⁄cm)",
      "uniqueId": "ESPbuttonec_cal_low__1413___s___cm_",
      "objectId": "ec_cal_low__1413___s___cm_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ec_cal_low__1413___s___cm_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchec_calibration_mode",
      "component": "switch",
      "name": "EC Calibration Mode",
      "uniqueId": "ESPswitchec_calibration_mode",
      "objectId": "ec_calibration_mode",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ec_calibration_mode/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ec_calibration_mode/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorec_calibration_status",
      "component": "sensor",
      "name": "EC Calibration Status",
      "uniqueId": "ESPsensorec_calibration_status",
      "objectId": "ec_calibration_status",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_calibration_status/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:check-circle",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espselectec_cell_constant",
      "component": "select",
      "name": "EC Cell Constant",
      "uniqueId": "ESPselectec_cell_constant",
      "objectId": "ec_cell_constant",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/select/ec_cell_constant/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/select/ec_cell_constant/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "config",
      "icon": "mdi:alpha-k-box-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "options": [
        "0.1",
        "1.0",
        "10.0"
      ],
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonec_clear_calibration",
      "component": "button",
      "name": "EC Clear Calibration",
      "uniqueId": "ESPbuttonec_clear_calibration",
      "objectId": "ec_clear_calibration",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ec_clear_calibration/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorec_current_command",
      "component": "sensor",
      "name": "EC Current Command",
      "uniqueId": "ESPsensorec_current_command",
      "objectId": "ec_current_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_current_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-line",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonec_dry_calibration",
      "component": "button",
      "name": "EC Dry Calibration",
      "uniqueId": "ESPbuttonec_dry_calibration",
      "objectId": "ec_dry_calibration",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ec_dry_calibration/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonec_factory_reset",
      "component": "button",
      "name": "EC Factory Reset",
      "uniqueId": "ESPbuttonec_factory_reset",
      "objectId": "ec_factory_reset",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ec_factory_reset/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorec_firmware_version",
      "component": "sensor",
      "name": "EC Firmware Version",
      "uniqueId": "ESPsensorec_firmware_version",
      "objectId": "ec_firmware_version",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_firmware_version/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:chip",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorec_last_command",
      "component": "sensor",
      "name": "EC Last Command",
      "uniqueId": "ESPsensorec_last_command",
      "objectId": "ec_last_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_last_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:history",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorec_next_command",
      "component": "sensor",
      "name": "EC Next Command",
      "uniqueId": "ESPsensorec_next_command",
      "objectId": "ec_next_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_next_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-network",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorec_queue_size",
      "component": "sensor",
      "name": "EC Queue Size",
      "uniqueId": "ESPsensorec_queue_size",
      "objectId": "ec_queue_size",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_queue_size/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:counter",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorec_reset_reason",
      "component": "sensor",
      "name": "EC Reset Reason",
      "uniqueId": "ESPsensorec_reset_reason",
      "objectId": "ec_reset_reason",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_reset_reason/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:information-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumberec_tds_conversion_factor",
      "component": "number",
      "name": "EC TDS Conversion Factor",
      "uniqueId": "ESPnumberec_tds_conversion_factor",
      "objectId": "ec_tds_conversion_factor",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/number/ec_tds_conversion_factor/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/number/ec_tds_conversion_factor/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "config",
      "icon": "mdi:water-percent",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 0.01,
      "max": 2,
      "step": 0.01,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchec_temperature_compensation",
      "component": "switch",
      "name": "EC Temperature Compensation",
      "uniqueId": "ESPswitchec_temperature_compensation",
      "objectId": "ec_temperature_compensation",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ec_temperature_compensation/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ec_temperature_compensation/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorec_temperature_compensation",
      "component": "sensor",
      "name": "EC Temperature Compensation",
      "uniqueId": "ESPsensorec_temperature_compensation",
      "objectId": "ec_temperature_compensation",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_temperature_compensation/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 2,
      "icon": "mdi:tune",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorec_voltage",
      "component": "sensor",
      "name": "EC Voltage",
      "uniqueId": "ESPsensorec_voltage",
      "objectId": "ec_voltage",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ec_voltage/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "V",
      "deviceClass": "voltage",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 3,
      "icon": "mdi:flash",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espswitchenable_aux_circuit",
      "component": "switch",
      "name": "Enable AUX Circuit",
      "uniqueId": "ESPswitchenable_aux_circuit",
      "objectId": "enable_aux_circuit",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_aux_circuit/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_aux_circuit/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchenable_ec_circuit",
      "component": "switch",
      "name": "Enable EC Circuit",
      "uniqueId": "ESPswitchenable_ec_circuit",
      "objectId": "enable_ec_circuit",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_ec_circuit/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_ec_circuit/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchenable_ph_circuit",
      "component": "switch",
      "name": "Enable pH Circuit",
      "uniqueId": "ESPswitchenable_ph_circuit",
      "objectId": "enable_ph_circuit",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_ph_circuit/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_ph_circuit/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchenable_rtd_circuit",
      "component": "switch",
      "name": "Enable RTD Circuit",
      "uniqueId": "ESPswitchenable_rtd_circuit",
      "objectId": "enable_rtd_circuit",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_rtd_circuit/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/enable_rtd_circuit/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensoresp_version",
      "component": "sensor",
      "name": "ESP Version",
      "uniqueId": "ESPsensoresp_version",
      "objectId": "esp_version",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/esp_version/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "icon": "mdi:new-box",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espupdatefirmware_update",
      "component": "update",
      "name": "Firmware Update",
      "uniqueId": "ESPupdatefirmware_update",
      "objectId": "firmware_update",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/update/firmware_update/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/update/firmware_update/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "entityCategory": "config",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "atlas_hydro_monitor_espupdatefirmware_update",
      "component": "update",
      "name": "Firmware Update",
      "uniqueId": "ESPupdatefirmware_update",
      "objectId": "firmware_update",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/update/firmware_update/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/update/firmware_update/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "config",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbinary_sensorhome_assistant_api_status",
      "component": "binary_sensor",
      "name": "Home Assistant API Status",
      "uniqueId": "ESPbinary_sensorhome_assistant_api_status",
      "objectId": "home_assistant_api_status",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "deviceClass": "connectivity",
      "entityCategory": "diagnostic",
      "payloadOn": "online",
      "payloadOff": "offline",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorhumidity",
      "component": "sensor",
      "name": "Humidity",
      "uniqueId": "ESPsensorhumidity",
      "objectId": "humidity",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/humidity/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "%",
      "deviceClass": "humidity",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 2,
      "icon": "mdi:water-percent",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbinary_sensorhumidity_high_alert",
      "component": "binary_sensor",
      "name": "Humidity High Alert",
      "uniqueId": "ESPbinary_sensorhumidity_high_alert",
      "objectId": "humidity_high_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/humidity_high_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumberhumidity_high_threshold",
      "component": "number",
      "name": "Humidity High Threshold",
      "uniqueId": "ESPnumberhumidity_high_threshold",
      "objectId": "humidity_high_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/humidity_high_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/humidity_high_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "%",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 30,
      "max": 90,
      "step": 1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbinary_sensorhumidity_low_alert",
      "component": "binary_sensor",
      "name": "Humidity Low Alert",
      "uniqueId": "ESPbinary_sensorhumidity_low_alert",
      "objectId": "humidity_low_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/humidity_low_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumberhumidity_low_threshold",
      "component": "number",
      "name": "Humidity Low Threshold",
      "uniqueId": "ESPnumberhumidity_low_threshold",
      "objectId": "humidity_low_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/humidity_low_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/humidity_low_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "%",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 10,
      "max": 60,
      "step": 1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorilluminance",
      "component": "sensor",
      "name": "Illuminance",
      "uniqueId": "ESPsensorilluminance",
      "objectId": "illuminance",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/illuminance/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "lx",
      "deviceClass": "illuminance",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorip_address",
      "component": "sensor",
      "name": "IP Address",
      "uniqueId": "ESPsensorip_address",
      "objectId": "ip_address",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/ip_address/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "atlas_hydro_monitor_espsensorip_address",
      "component": "sensor",
      "name": "IP Address",
      "uniqueId": "ESPsensorip_address",
      "objectId": "ip_address",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ip_address/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensormac_address",
      "component": "sensor",
      "name": "MAC Address",
      "uniqueId": "ESPsensormac_address",
      "objectId": "mac_address",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/mac_address/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensormlx90640_max_temp",
      "component": "sensor",
      "name": "MLX90640 Max temp",
      "uniqueId": "ESPsensormlx90640_max_temp",
      "objectId": "mlx90640_max_temp",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/mlx90640_max_temp/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumberthermal_alarm_high_threshold",
      "component": "number",
      "name": "Thermal Alarm High Threshold",
      "uniqueId": "ESPnumberthermal_alarm_high_threshold",
      "objectId": "thermal_alarm_high_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/thermal_alarm_high_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/thermal_alarm_high_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": -20,
      "max": 120,
      "step": 0.5,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espnumberthermal_alarm_low_threshold",
      "component": "number",
      "name": "Thermal Alarm Low Threshold",
      "uniqueId": "ESPnumberthermal_alarm_low_threshold",
      "objectId": "thermal_alarm_low_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/thermal_alarm_low_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/thermal_alarm_low_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": -40,
      "max": 100,
      "step": 0.5,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbinary_sensorthermal_alarm",
      "component": "binary_sensor",
      "name": "Thermal Alarm",
      "uniqueId": "ESPbinary_sensorthermal_alarm",
      "objectId": "thermal_alarm",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/thermal_alarm/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "deviceClass": "problem",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espswitchthermal_buzzer_enabled",
      "component": "switch",
      "name": "Thermal Buzzer Enabled",
      "uniqueId": "ESPswitchthermal_buzzer_enabled",
      "objectId": "thermal_buzzer_enabled",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/switch/thermal_buzzer_enabled/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/switch/thermal_buzzer_enabled/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonthermal_alarm_test",
      "component": "button",
      "name": "Thermal Alarm Test",
      "uniqueId": "ESPbuttonthermal_alarm_test",
      "objectId": "thermal_alarm_test",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/button/thermal_alarm_test/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensormlx90640_mean_temp",
      "component": "sensor",
      "name": "MLX90640 Mean temp",
      "uniqueId": "ESPsensormlx90640_mean_temp",
      "objectId": "mlx90640_mean_temp",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/mlx90640_mean_temp/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensormlx90640_min_temp",
      "component": "sensor",
      "name": "MLX90640 Min temp",
      "uniqueId": "ESPsensormlx90640_min_temp",
      "objectId": "mlx90640_min_temp",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/mlx90640_min_temp/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensormlx90640_roi_max_temp",
      "component": "sensor",
      "name": "MLX90640 ROI Max temp",
      "uniqueId": "ESPsensormlx90640_roi_max_temp",
      "objectId": "mlx90640_roi_max_temp",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/mlx90640_roi_max_temp/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensormlx90640_roi_mean_temp",
      "component": "sensor",
      "name": "MLX90640 ROI Mean temp",
      "uniqueId": "ESPsensormlx90640_roi_mean_temp",
      "objectId": "mlx90640_roi_mean_temp",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/mlx90640_roi_mean_temp/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensormlx90640_roi_min_temp",
      "component": "sensor",
      "name": "MLX90640 ROI Min temp",
      "uniqueId": "ESPsensormlx90640_roi_min_temp",
      "objectId": "mlx90640_roi_min_temp",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/mlx90640_roi_min_temp/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonorp_calibration_400_mv",
      "component": "button",
      "name": "ORP Calibration (400 mV)",
      "uniqueId": "ESPbuttonorp_calibration__400_mv_",
      "objectId": "orp_calibration__400_mv_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/orp_calibration__400_mv_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensororp_calibration_status",
      "component": "sensor",
      "name": "ORP Calibration Status",
      "uniqueId": "ESPsensororp_calibration_status",
      "objectId": "orp_calibration_status",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_calibration_status/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:check-circle",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonorp_clear_calibration",
      "component": "button",
      "name": "ORP Clear Calibration",
      "uniqueId": "ESPbuttonorp_clear_calibration",
      "objectId": "orp_clear_calibration",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/orp_clear_calibration/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensororp_current_command",
      "component": "sensor",
      "name": "ORP Current Command",
      "uniqueId": "ESPsensororp_current_command",
      "objectId": "orp_current_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_current_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-line",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espswitchorp_extended_scale",
      "component": "switch",
      "name": "ORP Extended Scale",
      "uniqueId": "ESPswitchorp_extended_scale",
      "objectId": "orp_extended_scale",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/orp_extended_scale/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/orp_extended_scale/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "config",
      "icon": "mdi:arrow-expand-horizontal",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonorp_factory_reset",
      "component": "button",
      "name": "ORP Factory Reset",
      "uniqueId": "ESPbuttonorp_factory_reset",
      "objectId": "orp_factory_reset",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/orp_factory_reset/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensororp_firmware_version",
      "component": "sensor",
      "name": "ORP Firmware Version",
      "uniqueId": "ESPsensororp_firmware_version",
      "objectId": "orp_firmware_version",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_firmware_version/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:chip",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensororp_last_command",
      "component": "sensor",
      "name": "ORP Last Command",
      "uniqueId": "ESPsensororp_last_command",
      "objectId": "orp_last_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_last_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:history",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensororp_next_command",
      "component": "sensor",
      "name": "ORP Next Command",
      "uniqueId": "ESPsensororp_next_command",
      "objectId": "orp_next_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_next_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-network",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensororp_queue_size",
      "component": "sensor",
      "name": "ORP Queue Size",
      "uniqueId": "ESPsensororp_queue_size",
      "objectId": "orp_queue_size",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_queue_size/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:counter",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensororp_reset_reason",
      "component": "sensor",
      "name": "ORP Reset Reason",
      "uniqueId": "ESPsensororp_reset_reason",
      "objectId": "orp_reset_reason",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_reset_reason/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:information-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensororp_voltage",
      "component": "sensor",
      "name": "ORP Voltage",
      "uniqueId": "ESPsensororp_voltage",
      "objectId": "orp_voltage",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/orp_voltage/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "V",
      "deviceClass": "voltage",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 3,
      "icon": "mdi:flash",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_acid_slope_quality",
      "component": "sensor",
      "name": "pH Acid Slope Quality",
      "uniqueId": "ESPsensorph_acid_slope_quality",
      "objectId": "ph_acid_slope_quality",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_acid_slope_quality/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "%",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "entityCategory": "diagnostic",
      "icon": "mdi:beaker-minus",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_alkaline_slope_quality",
      "component": "sensor",
      "name": "pH Alkaline Slope Quality",
      "uniqueId": "ESPsensorph_alkaline_slope_quality",
      "objectId": "ph_alkaline_slope_quality",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_alkaline_slope_quality/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "%",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 1,
      "entityCategory": "diagnostic",
      "icon": "mdi:beaker-plus",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_asymmetry_potential",
      "component": "sensor",
      "name": "pH Asymmetry Potential",
      "uniqueId": "ESPsensorph_asymmetry_potential",
      "objectId": "ph_asymmetry_potential",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_asymmetry_potential/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "mV",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 2,
      "entityCategory": "diagnostic",
      "icon": "mdi:sine-wave",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonph_cal_high_10_00",
      "component": "button",
      "name": "pH Cal High (10.00)",
      "uniqueId": "ESPbuttonph_cal_high__10_00_",
      "objectId": "ph_cal_high__10_00_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ph_cal_high__10_00_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonph_cal_low_4_00",
      "component": "button",
      "name": "pH Cal Low (4.00)",
      "uniqueId": "ESPbuttonph_cal_low__4_00_",
      "objectId": "ph_cal_low__4_00_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ph_cal_low__4_00_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonph_cal_mid_7_00",
      "component": "button",
      "name": "pH Cal Mid (7.00)",
      "uniqueId": "ESPbuttonph_cal_mid__7_00_",
      "objectId": "ph_cal_mid__7_00_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ph_cal_mid__7_00_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchph_calibration_mode",
      "component": "switch",
      "name": "pH Calibration Mode",
      "uniqueId": "ESPswitchph_calibration_mode",
      "objectId": "ph_calibration_mode",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ph_calibration_mode/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ph_calibration_mode/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorph_calibration_status",
      "component": "sensor",
      "name": "pH Calibration Status",
      "uniqueId": "ESPsensorph_calibration_status",
      "objectId": "ph_calibration_status",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_calibration_status/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:check-circle",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonph_clear_calibration",
      "component": "button",
      "name": "pH Clear Calibration",
      "uniqueId": "ESPbuttonph_clear_calibration",
      "objectId": "ph_clear_calibration",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ph_clear_calibration/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorph_current_command",
      "component": "sensor",
      "name": "pH Current Command",
      "uniqueId": "ESPsensorph_current_command",
      "objectId": "ph_current_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_current_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-line",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonph_factory_reset",
      "component": "button",
      "name": "pH Factory Reset",
      "uniqueId": "ESPbuttonph_factory_reset",
      "objectId": "ph_factory_reset",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/ph_factory_reset/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorph_firmware_version",
      "component": "sensor",
      "name": "pH Firmware Version",
      "uniqueId": "ESPsensorph_firmware_version",
      "objectId": "ph_firmware_version",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_firmware_version/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:chip",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_last_command",
      "component": "sensor",
      "name": "pH Last Command",
      "uniqueId": "ESPsensorph_last_command",
      "objectId": "ph_last_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_last_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:history",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_next_command",
      "component": "sensor",
      "name": "pH Next Command",
      "uniqueId": "ESPsensorph_next_command",
      "objectId": "ph_next_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_next_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-network",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_queue_size",
      "component": "sensor",
      "name": "pH Queue Size",
      "uniqueId": "ESPsensorph_queue_size",
      "objectId": "ph_queue_size",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_queue_size/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:counter",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_reset_reason",
      "component": "sensor",
      "name": "pH Reset Reason",
      "uniqueId": "ESPsensorph_reset_reason",
      "objectId": "ph_reset_reason",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_reset_reason/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:information-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espswitchph_temperature_compensation",
      "component": "switch",
      "name": "pH Temperature Compensation",
      "uniqueId": "ESPswitchph_temperature_compensation",
      "objectId": "ph_temperature_compensation",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ph_temperature_compensation/state",
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/switch/ph_temperature_compensation/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorph_temperature_compensation",
      "component": "sensor",
      "name": "pH Temperature Compensation",
      "uniqueId": "ESPsensorph_temperature_compensation",
      "objectId": "ph_temperature_compensation",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_temperature_compensation/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 2,
      "icon": "mdi:tune",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorph_voltage",
      "component": "sensor",
      "name": "pH Voltage",
      "uniqueId": "ESPsensorph_voltage",
      "objectId": "ph_voltage",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/ph_voltage/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "V",
      "deviceClass": "voltage",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 3,
      "icon": "mdi:flash",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonrefresh_circuit_state",
      "component": "button",
      "name": "Refresh Circuit State",
      "uniqueId": "ESPbuttonrefresh_circuit_state",
      "objectId": "refresh_circuit_state",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/refresh_circuit_state/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonrestart",
      "component": "button",
      "name": "Restart",
      "uniqueId": "ESPbuttonrestart",
      "objectId": "restart",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/button/restart/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "deviceClass": "restart",
      "entityCategory": "config",
      "icon": "mdi:restart",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonrestart_device",
      "component": "button",
      "name": "Restart Device",
      "uniqueId": "ESPbuttonrestart_device",
      "objectId": "restart_device",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/restart_device/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "deviceClass": "restart",
      "entityCategory": "config",
      "icon": "mdi:restart",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espnumberroi_center_column",
      "component": "number",
      "name": "ROI Center Column",
      "uniqueId": "ESPnumberroi_center_column",
      "objectId": "roi_center_column",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/roi_center_column/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/roi_center_column/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 1,
      "max": 32,
      "step": 1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espnumberroi_center_row",
      "component": "number",
      "name": "ROI Center Row",
      "uniqueId": "ESPnumberroi_center_row",
      "objectId": "roi_center_row",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/roi_center_row/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/roi_center_row/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 1,
      "max": 24,
      "step": 1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchroi_enabled",
      "component": "switch",
      "name": "ROI Enabled",
      "uniqueId": "ESPswitchroi_enabled",
      "objectId": "roi_enabled",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/switch/roi_enabled/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/switch/roi_enabled/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espnumberroi_size",
      "component": "number",
      "name": "ROI Size",
      "uniqueId": "ESPnumberroi_size",
      "objectId": "roi_size",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/roi_size/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/roi_size/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 1,
      "max": 10,
      "step": 1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbuttonrtd_calibration_25_0_c",
      "component": "button",
      "name": "RTD Calibration (25.0°C)",
      "uniqueId": "ESPbuttonrtd_calibration__25_0__c_",
      "objectId": "rtd_calibration__25_0__c_",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/rtd_calibration__25_0__c_/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorrtd_calibration_status",
      "component": "sensor",
      "name": "RTD Calibration Status",
      "uniqueId": "ESPsensorrtd_calibration_status",
      "objectId": "rtd_calibration_status",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_calibration_status/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:check-circle",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonrtd_clear_calibration",
      "component": "button",
      "name": "RTD Clear Calibration",
      "uniqueId": "ESPbuttonrtd_clear_calibration",
      "objectId": "rtd_clear_calibration",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/rtd_clear_calibration/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorrtd_current_command",
      "component": "sensor",
      "name": "RTD Current Command",
      "uniqueId": "ESPsensorrtd_current_command",
      "objectId": "rtd_current_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_current_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-line",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbuttonrtd_factory_reset",
      "component": "button",
      "name": "RTD Factory Reset",
      "uniqueId": "ESPbuttonrtd_factory_reset",
      "objectId": "rtd_factory_reset",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "commandTopic": "grow/daniel-home/atlas-hydro-monitor/button/rtd_factory_reset/command",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorrtd_firmware_version",
      "component": "sensor",
      "name": "RTD Firmware Version",
      "uniqueId": "ESPsensorrtd_firmware_version",
      "objectId": "rtd_firmware_version",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_firmware_version/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:chip",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorrtd_last_command",
      "component": "sensor",
      "name": "RTD Last Command",
      "uniqueId": "ESPsensorrtd_last_command",
      "objectId": "rtd_last_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_last_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:history",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorrtd_next_command",
      "component": "sensor",
      "name": "RTD Next Command",
      "uniqueId": "ESPsensorrtd_next_command",
      "objectId": "rtd_next_command",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_next_command/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:console-network",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorrtd_queue_size",
      "component": "sensor",
      "name": "RTD Queue Size",
      "uniqueId": "ESPsensorrtd_queue_size",
      "objectId": "rtd_queue_size",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_queue_size/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:counter",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorrtd_reset_reason",
      "component": "sensor",
      "name": "RTD Reset Reason",
      "uniqueId": "ESPsensorrtd_reset_reason",
      "objectId": "rtd_reset_reason",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_reset_reason/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "icon": "mdi:information-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": true,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorrtd_voltage",
      "component": "sensor",
      "name": "RTD Voltage",
      "uniqueId": "ESPsensorrtd_voltage",
      "objectId": "rtd_voltage",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/rtd_voltage/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "V",
      "deviceClass": "voltage",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 3,
      "icon": "mdi:flash",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensortemperature",
      "component": "sensor",
      "name": "Temperature",
      "uniqueId": "ESPsensortemperature",
      "objectId": "temperature",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/temperature/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 2,
      "icon": "mdi:thermometer",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbinary_sensortemperature_high_alert",
      "component": "binary_sensor",
      "name": "Temperature High Alert",
      "uniqueId": "ESPbinary_sensortemperature_high_alert",
      "objectId": "temperature_high_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/temperature_high_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumbertemperature_high_threshold",
      "component": "number",
      "name": "Temperature High Threshold",
      "uniqueId": "ESPnumbertemperature_high_threshold",
      "objectId": "temperature_high_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/temperature_high_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/temperature_high_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 15,
      "max": 40,
      "step": 0.5,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbinary_sensortemperature_low_alert",
      "component": "binary_sensor",
      "name": "Temperature Low Alert",
      "uniqueId": "ESPbinary_sensortemperature_low_alert",
      "objectId": "temperature_low_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/temperature_low_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumbertemperature_low_threshold",
      "component": "number",
      "name": "Temperature Low Threshold",
      "uniqueId": "ESPnumbertemperature_low_threshold",
      "objectId": "temperature_low_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/temperature_low_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/temperature_low_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "°C",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 10,
      "max": 25,
      "step": 0.5,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensortemperature_moving_average",
      "component": "sensor",
      "name": "Temperature Moving Average",
      "uniqueId": "ESPsensortemperature_moving_average",
      "objectId": "temperature_moving_average",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/temperature_moving_average/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "atoms3u_sensor_rig_thermal_camera",
      "component": "camera",
      "name": "Thermal Camera",
      "uniqueId": "atoms3u_sensor_rig_thermal_camera",
      "objectId": "thermal_camera",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig"
      },
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "imagePath": "/thermal.jpg",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espselectthermal_color_palette",
      "component": "select",
      "name": "Thermal Color Palette",
      "uniqueId": "ESPselectthermal_color_palette",
      "objectId": "thermal_color_palette",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/select/thermal_color_palette/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/select/thermal_color_palette/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "options": [
        "rainbow",
        "golden",
        "grayscale",
        "ironblack",
        "cam",
        "ironbow",
        "arctic",
        "lava",
        "whitehot",
        "blackhot"
      ],
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espswitchthermal_overlay_enable",
      "component": "switch",
      "name": "Thermal Overlay Enable",
      "uniqueId": "ESPswitchthermal_overlay_enable",
      "objectId": "thermal_overlay_enable",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/switch/thermal_overlay_enable/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/switch/thermal_overlay_enable/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espnumberthermal_update_interval",
      "component": "number",
      "name": "Thermal Update Interval",
      "uniqueId": "ESPnumberthermal_update_interval",
      "objectId": "thermal_update_interval",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/thermal_update_interval/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/thermal_update_interval/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 100,
      "max": 30000,
      "step": 100,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensoruptime",
      "component": "sensor",
      "name": "Uptime",
      "uniqueId": "ESPsensoruptime",
      "objectId": "uptime",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/uptime/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "s",
      "deviceClass": "duration",
      "stateClass": "total_increasing",
      "suggestedDisplayPrecision": 0,
      "entityCategory": "diagnostic",
      "icon": "mdi:timer-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "atlas_hydro_monitor_espsensoruptime",
      "component": "sensor",
      "name": "Uptime",
      "uniqueId": "ESPsensoruptime",
      "objectId": "uptime",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/uptime/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "s",
      "deviceClass": "duration",
      "stateClass": "total_increasing",
      "suggestedDisplayPrecision": 0,
      "entityCategory": "diagnostic",
      "icon": "mdi:timer-outline",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorvpd",
      "component": "sensor",
      "name": "VPD",
      "uniqueId": "ESPsensorvpd",
      "objectId": "vpd",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/vpd/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "kPa",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 2,
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espbinary_sensorvpd_high_alert",
      "component": "binary_sensor",
      "name": "VPD High Alert",
      "uniqueId": "ESPbinary_sensorvpd_high_alert",
      "objectId": "vpd_high_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/vpd_high_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumbervpd_high_threshold",
      "component": "number",
      "name": "VPD High Threshold",
      "uniqueId": "ESPnumbervpd_high_threshold",
      "objectId": "vpd_high_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/vpd_high_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/vpd_high_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "kPa",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 0.5,
      "max": 3,
      "step": 0.1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espbinary_sensorvpd_low_alert",
      "component": "binary_sensor",
      "name": "VPD Low Alert",
      "uniqueId": "ESPbinary_sensorvpd_low_alert",
      "objectId": "vpd_low_alert",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/binary_sensor/vpd_low_alert/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espnumbervpd_low_threshold",
      "component": "number",
      "name": "VPD Low Threshold",
      "uniqueId": "ESPnumbervpd_low_threshold",
      "objectId": "vpd_low_threshold",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/number/vpd_low_threshold/state",
      "commandTopic": "grow/daniel-home/atoms3u-sensor-rig/number/vpd_low_threshold/command",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "kPa",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "min": 0.1,
      "max": 1,
      "step": 0.1,
      "dangerous": false,
      "writable": true,
      "raw": {}
    },
    {
      "id": "espsensorwater_ec",
      "component": "sensor",
      "name": "Water EC",
      "uniqueId": "ESPsensorwater_ec",
      "objectId": "water_ec",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/water_ec/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "µS/cm",
      "deviceClass": "conductivity",
      "stateClass": "measurement",
      "icon": "mdi:water-check",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorwater_orp",
      "component": "sensor",
      "name": "Water ORP",
      "uniqueId": "ESPsensorwater_orp",
      "objectId": "water_orp",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/water_orp/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "mV",
      "deviceClass": "voltage",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:lightning-bolt",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorwater_ph",
      "component": "sensor",
      "name": "Water pH",
      "uniqueId": "ESPsensorwater_ph",
      "objectId": "water_ph",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/water_ph/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "pH",
      "deviceClass": "ph",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 3,
      "icon": "mdi:ph",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorwater_tds",
      "component": "sensor",
      "name": "Water TDS",
      "uniqueId": "ESPsensorwater_tds",
      "objectId": "water_tds",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/water_tds/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "ppm",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "icon": "mdi:water-opacity",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorwater_temperature",
      "component": "sensor",
      "name": "Water Temperature",
      "uniqueId": "ESPsensorwater_temperature",
      "objectId": "water_temperature",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/water_temperature/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "°C",
      "deviceClass": "temperature",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 3,
      "icon": "mdi:thermometer",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "espsensorwifi_signal",
      "component": "sensor",
      "name": "WiFi Signal",
      "uniqueId": "ESPsensorwifi_signal",
      "objectId": "wifi_signal",
      "nodeId": "atoms3u-sensor-rig",
      "device": {
        "identifiers": [
          "0123456789ab"
        ],
        "name": "AtomS3U Sensor Rig",
        "manufacturer": "stackdrift",
        "model": "atoms3u-sensor-rig",
        "swVersion": "dev (ESPHome 2026.5.1)"
      },
      "stateTopic": "grow/daniel-home/atoms3u-sensor-rig/sensor/wifi_signal/state",
      "availabilityTopic": "grow/daniel-home/atoms3u-sensor-rig/status",
      "unit": "dBm",
      "deviceClass": "signal_strength",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    },
    {
      "id": "atlas_hydro_monitor_espsensorwifi_signal",
      "component": "sensor",
      "name": "WiFi Signal",
      "uniqueId": "ESPsensorwifi_signal",
      "objectId": "wifi_signal",
      "nodeId": "atlas-hydro-monitor",
      "device": {
        "identifiers": [
          "fedcba987654"
        ],
        "name": "Atlas Hydro Monitor",
        "manufacturer": "stackdrift",
        "model": "atlas-hydro-kit",
        "swVersion": "edge-20260627T163826Z-033a9273cb7f (ESPHome 2026.5.3)"
      },
      "stateTopic": "grow/daniel-home/atlas-hydro-monitor/sensor/wifi_signal/state",
      "availabilityTopic": "grow/daniel-home/atlas-hydro-monitor/status",
      "unit": "dBm",
      "deviceClass": "signal_strength",
      "stateClass": "measurement",
      "suggestedDisplayPrecision": 0,
      "entityCategory": "diagnostic",
      "payloadOn": "ON",
      "payloadOff": "OFF",
      "payloadPress": "PRESS",
      "payloadAvailable": "online",
      "payloadNotAvailable": "offline",
      "dangerous": false,
      "writable": false,
      "raw": {}
    }
  ],
  "states": {
    "espnumberthermal_alarm_high_threshold": {
      "value": "32.000000",
      "updatedAt": "2026-06-29T08:55:35.103Z"
    },
    "espnumberthermal_alarm_low_threshold": {
      "value": "12.000000",
      "updatedAt": "2026-06-29T08:55:35.103Z"
    },
    "espbinary_sensorthermal_alarm": {
      "value": "OFF",
      "updatedAt": "2026-06-29T10:05:26.704Z"
    },
    "espswitchthermal_buzzer_enabled": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espnumberthermal_update_interval": {
      "value": "2000.000000",
      "updatedAt": "2026-06-29T08:55:35.103Z"
    },
    "espnumberroi_center_row": {
      "value": "15.000000",
      "updatedAt": "2026-06-29T08:55:35.103Z"
    },
    "espnumberroi_center_column": {
      "value": "11.000000",
      "updatedAt": "2026-06-29T08:55:35.111Z"
    },
    "espnumberroi_size": {
      "value": "1.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumberco2_high_threshold": {
      "value": "1500.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumberco2_low_threshold": {
      "value": "800.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumbertemperature_high_threshold": {
      "value": "30.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumbertemperature_low_threshold": {
      "value": "18.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumberhumidity_high_threshold": {
      "value": "70.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumberhumidity_low_threshold": {
      "value": "40.000000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumbervpd_high_threshold": {
      "value": "1.500000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumbervpd_low_threshold": {
      "value": "0.400000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espnumberec_tds_conversion_factor": {
      "value": "0.500000",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espselectthermal_color_palette": {
      "value": "rainbow",
      "updatedAt": "2026-06-29T08:55:35.112Z"
    },
    "espselectec_cell_constant": {
      "value": "1.0",
      "updatedAt": "2026-06-29T10:05:17.037Z"
    },
    "espswitchroi_enabled": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchthermal_overlay_enable": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchenable_ph_circuit": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchenable_ec_circuit": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchenable_aux_circuit": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchenable_rtd_circuit": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchph_temperature_compensation": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchec_temperature_compensation": {
      "value": "ON",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchph_calibration_mode": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchec_calibration_mode": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espswitchorp_extended_scale": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espsensormlx90640_min_temp": {
      "value": "22.6",
      "updatedAt": "2026-06-29T10:05:26.701Z"
    },
    "espsensormlx90640_max_temp": {
      "value": "32.2",
      "updatedAt": "2026-06-29T10:05:26.704Z"
    },
    "espsensormlx90640_mean_temp": {
      "value": "25.2",
      "updatedAt": "2026-06-29T10:05:26.704Z"
    },
    "espsensormlx90640_roi_min_temp": {
      "value": "23.0",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espsensormlx90640_roi_max_temp": {
      "value": "23.8",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espsensormlx90640_roi_mean_temp": {
      "value": "23.5",
      "updatedAt": "2026-06-29T08:55:35.113Z"
    },
    "espsensorco2": {
      "value": "827",
      "updatedAt": "2026-06-29T10:04:44.518Z"
    },
    "espsensortemperature": {
      "value": "25.63",
      "updatedAt": "2026-06-29T10:04:44.530Z"
    },
    "espsensorhumidity": {
      "value": "61.43",
      "updatedAt": "2026-06-29T10:04:44.531Z"
    },
    "espsensorbps_temperature": {
      "value": "25.1",
      "updatedAt": "2026-06-29T10:04:46.558Z"
    },
    "espsensorbarometric_pressure": {
      "value": "991.4",
      "updatedAt": "2026-06-29T10:04:46.561Z"
    },
    "espsensorilluminance": {
      "value": "41.3",
      "updatedAt": "2026-06-29T10:05:15.373Z"
    },
    "espsensoruptime": {
      "value": "94061",
      "updatedAt": "2026-06-29T10:04:44.511Z"
    },
    "espsensorwifi_signal": {
      "value": "-38",
      "updatedAt": "2026-06-29T10:04:44.515Z"
    },
    "espsensorvpd": {
      "value": "1.27",
      "updatedAt": "2026-06-29T10:05:12.652Z"
    },
    "espsensordaily_max_co2": {
      "value": "1098",
      "updatedAt": "2026-06-29T10:05:12.656Z"
    },
    "espsensordaily_min_temperature": {
      "value": "23",
      "updatedAt": "2026-06-29T10:05:12.657Z"
    },
    "espsensordaily_max_temperature": {
      "value": "26",
      "updatedAt": "2026-06-29T10:05:12.657Z"
    },
    "espsensorco2_moving_average": {
      "value": "827",
      "updatedAt": "2026-06-29T10:05:23.664Z"
    },
    "espsensortemperature_moving_average": {
      "value": "26",
      "updatedAt": "2026-06-29T10:05:23.668Z"
    },
    "espsensorip_address": {
      "value": "redacted",
      "updatedAt": "2026-06-29T08:55:35.114Z"
    },
    "espsensoresp_version": {
      "value": "2026.5.3 (config hash 0x9a4631a1)",
      "updatedAt": "2026-06-29T08:55:35.114Z"
    },
    "espsensorconnected_ssid": {
      "value": "redacted",
      "updatedAt": "2026-06-29T08:55:35.114Z"
    },
    "espsensorconnected_bssid": {
      "value": "redacted",
      "updatedAt": "2026-06-29T08:55:35.114Z"
    },
    "espsensormac_address": {
      "value": "redacted",
      "updatedAt": "2026-06-29T08:55:35.115Z"
    },
    "espsensordns_address": {
      "value": "192.0.2.1 0.0.0.0",
      "updatedAt": "2026-06-29T08:55:35.115Z"
    },
    "atlas_hydro_monitor_espsensorip_address": {
      "value": "redacted",
      "updatedAt": "2026-06-29T08:55:35.115Z"
    },
    "espsensorwater_ph": {
      "value": "6.214",
      "updatedAt": "2026-06-29T10:05:25.267Z"
    },
    "espsensorph_voltage": {
      "value": "3.860",
      "updatedAt": "2026-06-29T10:05:25.601Z"
    },
    "espsensorph_reset_reason": {
      "value": "Powered off",
      "updatedAt": "2026-06-29T10:05:25.599Z"
    },
    "espsensorph_firmware_version": {
      "value": "2.17",
      "updatedAt": "2026-06-29T08:55:35.115Z"
    },
    "espsensorph_calibration_status": {
      "value": "Three Point",
      "updatedAt": "2026-06-29T10:04:26.610Z"
    },
    "espsensorph_current_command": {
      "value": "(empty)",
      "updatedAt": "2026-06-29T10:05:25.941Z"
    },
    "espsensorph_next_command": {
      "value": "(none)",
      "updatedAt": "2026-06-29T10:05:25.602Z"
    },
    "espsensorph_last_command": {
      "value": "T,?",
      "updatedAt": "2026-06-29T10:05:25.941Z"
    },
    "espsensorph_queue_size": {
      "value": "0",
      "updatedAt": "2026-06-29T10:05:25.940Z"
    },
    "espsensorph_temperature_compensation": {
      "value": "24.91",
      "updatedAt": "2026-06-29T10:05:25.935Z"
    },
    "espsensorwater_ec": {
      "value": "0",
      "updatedAt": "2026-06-29T10:05:26.078Z"
    },
    "espsensorec_voltage": {
      "value": "3.880",
      "updatedAt": "2026-06-29T10:05:26.384Z"
    },
    "espsensorec_reset_reason": {
      "value": "Powered off",
      "updatedAt": "2026-06-29T10:05:26.382Z"
    },
    "espsensorec_firmware_version": {
      "value": "2.17",
      "updatedAt": "2026-06-29T08:55:35.116Z"
    },
    "espsensorec_calibration_status": {
      "value": "Three Point",
      "updatedAt": "2026-06-29T10:04:27.403Z"
    },
    "espsensorec_current_command": {
      "value": "(empty)",
      "updatedAt": "2026-06-29T10:05:26.725Z"
    },
    "espsensorec_next_command": {
      "value": "(none)",
      "updatedAt": "2026-06-29T10:05:26.390Z"
    },
    "espsensorec_last_command": {
      "value": "T,?",
      "updatedAt": "2026-06-29T10:05:26.725Z"
    },
    "espsensorec_queue_size": {
      "value": "0",
      "updatedAt": "2026-06-29T10:05:26.723Z"
    },
    "espsensorec_temperature_compensation": {
      "value": "24.91",
      "updatedAt": "2026-06-29T10:05:26.720Z"
    },
    "espsensorwater_temperature": {
      "value": "24.912",
      "updatedAt": "2026-06-29T10:05:26.226Z"
    },
    "espsensorrtd_voltage": {
      "value": "5.010",
      "updatedAt": "2026-06-29T10:05:26.565Z"
    },
    "espsensorrtd_reset_reason": {
      "value": "Powered off",
      "updatedAt": "2026-06-29T10:05:26.561Z"
    },
    "espsensorrtd_firmware_version": {
      "value": "2.14",
      "updatedAt": "2026-06-29T10:05:06.898Z"
    },
    "espsensorrtd_calibration_status": {
      "value": "Factory",
      "updatedAt": "2026-06-29T10:04:26.878Z"
    },
    "espsensorrtd_current_command": {
      "value": "(empty)",
      "updatedAt": "2026-06-29T10:05:26.567Z"
    },
    "espsensorrtd_next_command": {
      "value": "(none)",
      "updatedAt": "2026-06-29T10:05:26.228Z"
    },
    "espsensorrtd_last_command": {
      "value": "STATUS",
      "updatedAt": "2026-06-29T10:05:26.567Z"
    },
    "espsensorrtd_queue_size": {
      "value": "0",
      "updatedAt": "2026-06-29T10:05:26.567Z"
    },
    "espsensorwater_orp": {
      "value": "156",
      "updatedAt": "2026-06-29T10:05:25.707Z"
    },
    "espsensororp_voltage": {
      "value": "3.770",
      "updatedAt": "2026-06-29T10:05:26.078Z"
    },
    "espsensororp_reset_reason": {
      "value": "Powered off",
      "updatedAt": "2026-06-29T10:05:26.035Z"
    },
    "espsensororp_firmware_version": {
      "value": "2.14",
      "updatedAt": "2026-06-29T10:05:21.405Z"
    },
    "espsensororp_calibration_status": {
      "value": "User Calibrated",
      "updatedAt": "2026-06-29T10:04:26.402Z"
    },
    "espsensororp_current_command": {
      "value": "(empty)",
      "updatedAt": "2026-06-29T10:05:26.078Z"
    },
    "espsensororp_next_command": {
      "value": "(none)",
      "updatedAt": "2026-06-29T10:05:25.710Z"
    },
    "espsensororp_last_command": {
      "value": "STATUS",
      "updatedAt": "2026-06-29T10:05:26.078Z"
    },
    "espsensororp_queue_size": {
      "value": "0",
      "updatedAt": "2026-06-29T10:05:26.078Z"
    },
    "atlas_hydro_monitor_espsensorwifi_signal": {
      "value": "-64",
      "updatedAt": "2026-06-29T10:05:02.138Z"
    },
    "atlas_hydro_monitor_espsensoruptime": {
      "value": "123484",
      "updatedAt": "2026-06-29T10:05:02.181Z"
    },
    "espsensorph_acid_slope_quality": {
      "value": "100.6",
      "updatedAt": "2026-06-29T10:05:16.264Z"
    },
    "espsensorph_alkaline_slope_quality": {
      "value": "96.4",
      "updatedAt": "2026-06-29T10:05:16.266Z"
    },
    "espsensorph_asymmetry_potential": {
      "value": "-13.69",
      "updatedAt": "2026-06-29T10:05:16.266Z"
    },
    "espsensorwater_tds": {
      "value": "0",
      "updatedAt": "2026-06-29T10:05:26.078Z"
    },
    "espbinary_sensorco2_high_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.118Z"
    },
    "espbinary_sensorco2_low_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.118Z"
    },
    "espbinary_sensortemperature_high_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espbinary_sensortemperature_low_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espbinary_sensorhumidity_high_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espbinary_sensorhumidity_low_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espbinary_sensorvpd_high_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espbinary_sensorvpd_low_alert": {
      "value": "OFF",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espbinary_sensorhome_assistant_api_status": {
      "value": "online",
      "updatedAt": "2026-06-29T08:55:35.119Z"
    },
    "espupdatefirmware_update": {
      "value": "{\"installed_version\":\"dev\",\"latest_version\":\"edge-20260628T112454Z-0f89e3686b5f\",\"title\":\"stackdrift.atoms3u-sensor-rig\",\"release_summary\":\"3 commits since edge-20260627T163826Z-033a9273cb7f\",\"release_url\":\"https://github.com/dephekt/grow-fleet/commit/0f89e3686b5f4f5a4c8f258d3f14e7f5d4a73186\"}",
      "updatedAt": "2026-06-29T08:55:35.121Z"
    },
    "atlas_hydro_monitor_espupdatefirmware_update": {
      "value": "{\"installed_version\":\"edge-20260627T163826Z-033a9273cb7f\",\"latest_version\":\"edge-20260627T163826Z-033a9273cb7f\",\"title\":\"stackdrift.atlas-hydro-kit\",\"release_summary\":\"Initial edge firmware package for atlas-hydro-kit\",\"release_url\":\"https://github.com/dephekt/grow-fleet/commit/033a9273cb7f742b49067e22a9bfccbb750509e0\"}",
      "updatedAt": "2026-06-29T08:55:35.121Z"
    }
  },
  "uiConfigs": {
    "atoms3u-sensor-rig": {
      "schema": "grow-ui.v1",
      "nodeId": "atoms3u-sensor-rig",
      "groups": [
        {
          "id": "overview",
          "title": "Environment",
          "order": 10,
          "variant": "metrics",
          "surface": "dashboard",
          "defaultOpen": true
        },
        {
          "id": "thermal_view",
          "title": "Thermal Camera",
          "order": 15,
          "variant": "camera",
          "surface": "dashboard",
          "defaultOpen": true
        },
        {
          "id": "thresholds",
          "title": "Thresholds & Alerts",
          "order": 20,
          "surface": "device-settings",
          "deviceSettingsSection": "alerts",
          "defaultOpen": false
        },
        {
          "id": "thermal",
          "title": "Thermal Camera",
          "order": 30,
          "surface": "device-settings",
          "deviceSettingsSection": "controls",
          "defaultOpen": false
        },
        {
          "id": "maintenance",
          "title": "Maintenance",
          "order": 80,
          "surface": "device-settings",
          "deviceSettingsSection": "maintenance",
          "defaultOpen": false
        },
        {
          "id": "diagnostics",
          "title": "Diagnostics",
          "order": 90,
          "surface": "device-settings",
          "deviceSettingsSection": "diagnostics",
          "defaultOpen": false
        }
      ],
      "entities": [
        {
          "component": "sensor",
          "objectId": "co2",
          "group": "overview",
          "role": "metric",
          "order": 10
        },
        {
          "component": "sensor",
          "objectId": "temperature",
          "group": "overview",
          "role": "metric",
          "order": 20
        },
        {
          "component": "sensor",
          "objectId": "humidity",
          "group": "overview",
          "role": "metric",
          "order": 30
        },
        {
          "component": "sensor",
          "objectId": "vpd",
          "group": "overview",
          "role": "metric",
          "order": 40
        },
        {
          "component": "sensor",
          "objectId": "illuminance",
          "group": "overview",
          "role": "metric",
          "order": 50
        },
        {
          "component": "sensor",
          "objectId": "barometric_pressure",
          "group": "overview",
          "role": "metric",
          "order": 60,
          "label": "Pressure"
        },
        {
          "component": "camera",
          "objectId": "thermal_camera",
          "group": "thermal_view",
          "role": "camera",
          "order": 10,
          "label": "Thermal Camera"
        },
        {
          "component": "number",
          "objectId": "co2_high_threshold",
          "group": "thresholds",
          "order": 10
        },
        {
          "component": "number",
          "objectId": "co2_low_threshold",
          "group": "thresholds",
          "order": 20
        },
        {
          "component": "binary_sensor",
          "objectId": "co2_high_alert",
          "group": "thresholds",
          "order": 30
        },
        {
          "component": "binary_sensor",
          "objectId": "co2_low_alert",
          "group": "thresholds",
          "order": 40
        },
        {
          "component": "number",
          "objectId": "temperature_high_threshold",
          "group": "thresholds",
          "order": 50
        },
        {
          "component": "number",
          "objectId": "temperature_low_threshold",
          "group": "thresholds",
          "order": 60
        },
        {
          "component": "binary_sensor",
          "objectId": "temperature_high_alert",
          "group": "thresholds",
          "order": 70
        },
        {
          "component": "binary_sensor",
          "objectId": "temperature_low_alert",
          "group": "thresholds",
          "order": 80
        },
        {
          "component": "number",
          "objectId": "humidity_high_threshold",
          "group": "thresholds",
          "order": 90
        },
        {
          "component": "number",
          "objectId": "humidity_low_threshold",
          "group": "thresholds",
          "order": 100
        },
        {
          "component": "binary_sensor",
          "objectId": "humidity_high_alert",
          "group": "thresholds",
          "order": 110
        },
        {
          "component": "binary_sensor",
          "objectId": "humidity_low_alert",
          "group": "thresholds",
          "order": 120
        },
        {
          "component": "number",
          "objectId": "vpd_high_threshold",
          "group": "thresholds",
          "order": 130
        },
        {
          "component": "number",
          "objectId": "vpd_low_threshold",
          "group": "thresholds",
          "order": 140
        },
        {
          "component": "binary_sensor",
          "objectId": "vpd_high_alert",
          "group": "thresholds",
          "order": 150
        },
        {
          "component": "binary_sensor",
          "objectId": "vpd_low_alert",
          "group": "thresholds",
          "order": 160
        },
        {
          "component": "number",
          "objectId": "thermal_alarm_high_threshold",
          "group": "thresholds",
          "order": 170
        },
        {
          "component": "number",
          "objectId": "thermal_alarm_low_threshold",
          "group": "thresholds",
          "order": 180
        },
        {
          "component": "binary_sensor",
          "objectId": "thermal_alarm",
          "group": "thresholds",
          "order": 190
        },
        {
          "component": "switch",
          "objectId": "thermal_buzzer_enabled",
          "group": "thresholds",
          "order": 200
        },
        {
          "component": "button",
          "objectId": "thermal_alarm_test",
          "group": "thresholds",
          "order": 210
        },
        {
          "component": "sensor",
          "objectId": "mlx90640_min_temp",
          "group": "thermal",
          "order": 10
        },
        {
          "component": "sensor",
          "objectId": "mlx90640_mean_temp",
          "group": "thermal",
          "order": 20
        },
        {
          "component": "sensor",
          "objectId": "mlx90640_max_temp",
          "group": "thermal",
          "order": 30
        },
        {
          "component": "sensor",
          "objectId": "mlx90640_roi_min_temp",
          "group": "thermal",
          "order": 40
        },
        {
          "component": "sensor",
          "objectId": "mlx90640_roi_mean_temp",
          "group": "thermal",
          "order": 50
        },
        {
          "component": "sensor",
          "objectId": "mlx90640_roi_max_temp",
          "group": "thermal",
          "order": 60
        },
        {
          "component": "select",
          "objectId": "thermal_color_palette",
          "group": "thermal_view",
          "role": "quick-control",
          "order": 20
        },
        {
          "component": "switch",
          "objectId": "thermal_overlay_enable",
          "group": "thermal_view",
          "role": "quick-control",
          "order": 30
        },
        {
          "component": "switch",
          "objectId": "roi_enabled",
          "group": "thermal_view",
          "role": "quick-control",
          "order": 40
        },
        {
          "component": "number",
          "objectId": "roi_center_row",
          "group": "thermal_view",
          "role": "quick-control",
          "order": 50
        },
        {
          "component": "number",
          "objectId": "roi_center_column",
          "group": "thermal_view",
          "role": "quick-control",
          "order": 60
        },
        {
          "component": "number",
          "objectId": "roi_size",
          "group": "thermal_view",
          "role": "quick-control",
          "order": 70
        },
        {
          "component": "number",
          "objectId": "thermal_update_interval",
          "group": "thermal",
          "order": 70
        },
        {
          "component": "button",
          "objectId": "restart",
          "group": "maintenance",
          "order": 10
        }
      ]
    },
    "atlas-hydro-monitor": {
      "schema": "grow-ui.v1",
      "nodeId": "atlas-hydro-monitor",
      "groups": [
        {
          "id": "overview",
          "title": "At a Glance",
          "order": 10,
          "variant": "metrics",
          "surface": "dashboard",
          "defaultOpen": true
        },
        {
          "id": "controls",
          "title": "Circuit Controls",
          "order": 20,
          "surface": "device-settings",
          "deviceSettingsSection": "controls",
          "defaultOpen": false
        },
        {
          "id": "temp_comp",
          "title": "Temperature Compensation",
          "order": 25,
          "surface": "device-settings",
          "deviceSettingsSection": "controls",
          "defaultOpen": false
        },
        {
          "id": "ph_cal",
          "title": "pH Calibration",
          "order": 30,
          "surface": "device-settings",
          "deviceSettingsSection": "calibration",
          "defaultOpen": false
        },
        {
          "id": "ec_cal",
          "title": "EC Calibration",
          "order": 40,
          "surface": "device-settings",
          "deviceSettingsSection": "calibration",
          "defaultOpen": false
        },
        {
          "id": "rtd_cal",
          "title": "RTD Calibration",
          "order": 50,
          "surface": "device-settings",
          "deviceSettingsSection": "calibration",
          "defaultOpen": false
        },
        {
          "id": "orp_cal",
          "title": "ORP Calibration",
          "order": 60,
          "surface": "device-settings",
          "deviceSettingsSection": "calibration",
          "defaultOpen": false
        },
        {
          "id": "maintenance",
          "title": "Maintenance",
          "order": 80,
          "surface": "device-settings",
          "deviceSettingsSection": "maintenance",
          "defaultOpen": false
        },
        {
          "id": "diagnostics",
          "title": "Diagnostics",
          "order": 90,
          "surface": "device-settings",
          "deviceSettingsSection": "diagnostics",
          "defaultOpen": false
        }
      ],
      "entities": [
        {
          "component": "sensor",
          "objectId": "water_temperature",
          "group": "overview",
          "role": "metric",
          "order": 10,
          "label": "Water Temp"
        },
        {
          "component": "sensor",
          "objectId": "water_ph",
          "group": "overview",
          "role": "metric",
          "order": 20,
          "label": "Water pH"
        },
        {
          "component": "sensor",
          "objectId": "water_ec",
          "group": "overview",
          "role": "metric",
          "order": 30,
          "label": "Water EC"
        },
        {
          "component": "sensor",
          "objectId": "water_tds",
          "group": "overview",
          "role": "metric",
          "order": 40,
          "label": "Water TDS"
        },
        {
          "component": "sensor",
          "objectId": "water_orp",
          "group": "overview",
          "role": "metric",
          "order": 50,
          "label": "Water ORP"
        },
        {
          "component": "switch",
          "objectId": "enable_ph_circuit",
          "group": "controls",
          "order": 10
        },
        {
          "component": "switch",
          "objectId": "enable_ec_circuit",
          "group": "controls",
          "order": 20
        },
        {
          "component": "switch",
          "objectId": "enable_rtd_circuit",
          "group": "controls",
          "order": 30
        },
        {
          "component": "switch",
          "objectId": "enable_aux_circuit",
          "group": "controls",
          "order": 40
        },
        {
          "component": "select",
          "objectId": "ec_cell_constant",
          "group": "controls",
          "order": 50
        },
        {
          "component": "number",
          "objectId": "ec_tds_conversion_factor",
          "group": "controls",
          "order": 60
        },
        {
          "component": "switch",
          "objectId": "orp_extended_scale",
          "group": "controls",
          "order": 70
        },
        {
          "component": "switch",
          "objectId": "ph_temperature_compensation",
          "group": "temp_comp",
          "order": 10,
          "label": "pH Compensation Enabled"
        },
        {
          "component": "sensor",
          "objectId": "ph_temperature_compensation",
          "group": "temp_comp",
          "order": 20,
          "label": "pH Compensation Temp"
        },
        {
          "component": "switch",
          "objectId": "ec_temperature_compensation",
          "group": "temp_comp",
          "order": 30,
          "label": "EC Compensation Enabled"
        },
        {
          "component": "sensor",
          "objectId": "ec_temperature_compensation",
          "group": "temp_comp",
          "order": 40,
          "label": "EC Compensation Temp"
        },
        {
          "component": "switch",
          "objectId": "ph_calibration_mode",
          "group": "ph_cal",
          "order": 10
        },
        {
          "component": "sensor",
          "objectId": "ph_calibration_status",
          "group": "ph_cal",
          "order": 20
        },
        {
          "component": "sensor",
          "objectId": "ph_acid_slope_quality",
          "group": "ph_cal",
          "order": 30
        },
        {
          "component": "sensor",
          "objectId": "ph_alkaline_slope_quality",
          "group": "ph_cal",
          "order": 40
        },
        {
          "component": "sensor",
          "objectId": "ph_asymmetry_potential",
          "group": "ph_cal",
          "order": 50
        },
        {
          "component": "button",
          "objectId": "ph_cal_mid__7_00_",
          "group": "ph_cal",
          "order": 60
        },
        {
          "component": "button",
          "objectId": "ph_cal_low__4_00_",
          "group": "ph_cal",
          "order": 70
        },
        {
          "component": "button",
          "objectId": "ph_cal_high__10_00_",
          "group": "ph_cal",
          "order": 80
        },
        {
          "component": "button",
          "objectId": "ph_clear_calibration",
          "group": "ph_cal",
          "order": 90
        },
        {
          "component": "switch",
          "objectId": "ec_calibration_mode",
          "group": "ec_cal",
          "order": 10
        },
        {
          "component": "sensor",
          "objectId": "ec_calibration_status",
          "group": "ec_cal",
          "order": 20
        },
        {
          "component": "button",
          "objectId": "ec_dry_calibration",
          "group": "ec_cal",
          "order": 30
        },
        {
          "component": "button",
          "objectId": "ec_cal_low__1413___s___cm_",
          "group": "ec_cal",
          "order": 40
        },
        {
          "component": "button",
          "objectId": "ec_cal_high__5000___s___cm_",
          "group": "ec_cal",
          "order": 50
        },
        {
          "component": "button",
          "objectId": "ec_clear_calibration",
          "group": "ec_cal",
          "order": 60
        },
        {
          "component": "sensor",
          "objectId": "rtd_calibration_status",
          "group": "rtd_cal",
          "order": 10
        },
        {
          "component": "button",
          "objectId": "rtd_calibration__25_0__c_",
          "group": "rtd_cal",
          "order": 20
        },
        {
          "component": "button",
          "objectId": "rtd_clear_calibration",
          "group": "rtd_cal",
          "order": 30
        },
        {
          "component": "sensor",
          "objectId": "orp_calibration_status",
          "group": "orp_cal",
          "order": 10
        },
        {
          "component": "button",
          "objectId": "orp_calibration__400_mv_",
          "group": "orp_cal",
          "order": 20
        },
        {
          "component": "button",
          "objectId": "orp_clear_calibration",
          "group": "orp_cal",
          "order": 30
        },
        {
          "component": "button",
          "objectId": "refresh_circuit_state",
          "group": "maintenance",
          "order": 10
        },
        {
          "component": "button",
          "objectId": "restart_device",
          "group": "maintenance",
          "order": 20
        },
        {
          "component": "button",
          "objectId": "ph_factory_reset",
          "group": "maintenance",
          "order": 30
        },
        {
          "component": "button",
          "objectId": "ec_factory_reset",
          "group": "maintenance",
          "order": 40
        },
        {
          "component": "button",
          "objectId": "rtd_factory_reset",
          "group": "maintenance",
          "order": 50
        },
        {
          "component": "button",
          "objectId": "orp_factory_reset",
          "group": "maintenance",
          "order": 60
        }
      ]
    }
  },
  "firmware": {
    "devices": {
      "atoms3u-sensor-rig": {
        "schema": "grow-firmware-device.v1",
        "nodeId": "atoms3u-sensor-rig",
        "projectName": "stackdrift.atoms3u-sensor-rig",
        "packageOwner": "stackdrift-firmware",
        "package": "atoms3u-sensor-rig",
        "device": "atoms3u-sensor-rig",
        "chipFamily": "ESP32-S3",
        "installedVersion": "dev",
        "manifestUrl": "http://192.0.2.3:3080/api/firmware/devices/atoms3u-sensor-rig/manifest"
      },
      "atlas-hydro-monitor": {
        "schema": "grow-firmware-device.v1",
        "nodeId": "atlas-hydro-monitor",
        "projectName": "stackdrift.atlas-hydro-kit",
        "packageOwner": "stackdrift-firmware",
        "package": "atlas-hydro-kit",
        "device": "atlas-hydro-kit",
        "chipFamily": "ESP32",
        "installedVersion": "edge-20260627T163826Z-033a9273cb7f",
        "manifestUrl": "http://192.0.2.3:3080/api/firmware/devices/atlas-hydro-monitor/manifest"
      }
    },
    "channels": {
      "atoms3u-sensor-rig": {
        "schema": "grow-firmware-channel.v1",
        "nodeId": "atoms3u-sensor-rig",
        "channel": "edge",
        "updatedAt": "2026-06-28T06:18:25.295Z"
      },
      "atlas-hydro-monitor": {
        "schema": "grow-firmware-channel.v1",
        "nodeId": "atlas-hydro-monitor",
        "channel": "stable",
        "updatedAt": "2026-06-28T05:16:02.970Z"
      }
    }
  }
} satisfies Snapshot;
