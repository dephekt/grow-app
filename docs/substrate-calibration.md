# Substrate calibration profiles

The app derives TEROS 11/12 volumetric water content (VWC) and pore-water electrical
conductivity (pwEC) from the substrate type assigned to a probe's zone. These are the
default profiles:

| Zone medium                     | VWC calibration            | Hilhorst εσb=0 | Basis                                 |
| ------------------------------- | -------------------------- | -------------: | ------------------------------------- |
| Coco or coir                    | TEROS soilless, equation 7 |           1.64 | Lee & Kim measured the coir intercept |
| Rockwool or stonewool           | TEROS soilless, equation 7 |            4.1 | Hilhorst measured 4.1 for rockwool    |
| Other recognised soilless media | TEROS soilless, equation 7 |            4.1 | TEROS generic default                 |
| Mineral media                   | TEROS mineral, equation 6  |            4.1 | TEROS generic default                 |

An empty or unrecognised medium keeps the prior soilless/4.1 fallback and is marked as
assumed in the UI.

## Evidence

- [Hilhorst (2000)](https://doi.org/10.2136/sssaj2000.6461922x) defines the pwEC model and
  reports εσb=0 = 4.1 for rockwool in Table 1. It also treats the intercept as
  medium-specific and limits the method to VWC above 0.10 m³/m³.
- [Lee & Kim (2024)](https://doi.org/10.1016/j.agwat.2024.108836) measured the Hilhorst
  intercept for coir as 1.64 using TEROS 12 readings across 16 moisture/EC treatments.
- [Miyamoto et al. (2021)](https://doi.org/10.1002/saj2.20208) found the manufacturer's
  growing-media VWC calibration suitable for coir and found the unadjusted Hilhorst model
  overestimated coir solution EC.
- [Sodini et al. (2024)](https://doi.org/10.1016/j.compag.2024.108746) used a manufacturer's
  soilless VWC calibration in rockwool and found a fixed Hilhorst estimate substantially
  less accurate than direct pore-water EC measurements.
- The [TEROS 11/12 manual](https://publications.metergroup.com/Manuals/20587_TEROS11-12_Manual_Web.pdf)
  publishes the soilless and mineral VWC equations, the generic 4.1 Hilhorst offset, and
  the VWC 0.10 validity floor used here.

## Interpretation limits

These profiles are literature-backed defaults, not batch-specific calibrations. Coir
source, compaction, and water chemistry can move both the VWC curve and Hilhorst
intercept, so a measured calibration for the installed medium should supersede a default
if one becomes available.

The app deliberately labels the derived value `pwEC`. Lee & Kim and Sodini et al. show
that a Hilhorst pwEC estimate is not interchangeable with saturated-extract, pour-through,
or directly sampled solution EC. The app therefore does not apply either paper's
post-Hilhorst regression or present pwEC as an extraction-method reading.
