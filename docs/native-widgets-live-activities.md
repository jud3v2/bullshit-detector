# Native widgets and live activities

Bullshit Detector can preview native monetization surfaces in Expo Go, but real widgets and Dynamic Island support require an EAS development build because they need native extensions.

## iOS

- `NSSupportsLiveActivities` is enabled in `app.json`.
- Next native step: add a WidgetKit extension with an App Group.
- Dynamic Island should be powered by ActivityKit:
  - start when a long AI analysis begins
  - update progress while public context and AI verdict are running
  - end with score, risk, and a deep link to `/analysis`

Premium use cases:

- Starter: Live Activity for long analyses.
- Plus: Home Screen widget with quota and last verdict.
- Pro: multiple widgets and priority analysis activity.

## Android

Android should use a separate native experience:

- App Widget for remaining credits, last score, and paste/analyze shortcut.
- Notification progress for long analysis.
- Deep links back to `bullshitdetector://analyze`.

Implementation options:

- Native Android widget provider in a dev build.
- Jetpack Glance if the native Android layer is introduced.

## Shared data contract

The native layer should only read compact state:

- latest score
- latest risk
- remaining visible credits
- current plan
- current analysis status
- deep link target

Do not write full user content into native widgets, Live Activities, logs, or shared storage.
