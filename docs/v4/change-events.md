# Change Events — deferred

Events will interpret observations and publish useful claims for consumer products. Its full design
and implementation are deferred until the ingestion/projection/retained-data strategy is settled.
The previous V4 implementation has been removed.

[Implementation stages](stages.md#6-design-and-implement-events-and-its-products--fully-deferred)
owns this gate and its checklist. Ingestion completion remains meaningful independently of Events.

V3's early Events work can inform later design. `textFeed` is a stand-in consumer; future
Monitor/Alerts/Discord products will be rebuilt. Their current implementations are not integration
targets, and existing subscription or transport code carries no reuse requirement.

Historical context, publication identity, consumer query needs and delivery eligibility are future
design inputs. Table schemas, payload kinds, claim protocols, publication boundaries and recovery
behavior will be settled together during that stage.
