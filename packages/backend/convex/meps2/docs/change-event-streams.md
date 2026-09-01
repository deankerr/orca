# Change Event Streams

A later feed of catalog change, for Monitor and Discord alerts. Undesigned.
Apply writes views and series only.

The intended input is compare's source-shaped `IChange` items (create / absent /
update), not flattened view rows. Adjacent scan artifacts remain the rebuild
path: explode + compare again.

- 💤 Persistence, event schema, and which diffs are notification-worthy.
- ⚠️ Skip lists are a view-write knob. They are not the event filter. Compare
  stays on source-shaped objects so a stream can use a different skip set.
- ⚠️ List/unlist history is not on the view. That signal is compare `absent` /
  `create` against a retained row, not `unlisted_at` restamps.
