# Suspected historical endpoint-fetch failures

This note preserves the inconclusive result of a one-off investigation into historical OpenRouter
endpoint disappearances. It is diagnostic evidence, not an automatic cleaning rule.

The scan tracked endpoint IDs that disappeared and later returned. For gaps of five retained crawls
or fewer, a case remained only when the whole model variant went from at least one endpoint to zero
and still had zero endpoints immediately before recovery. This reduced 198 endpoint-gap occurrences
to 66 endpoints across 23 windows. Legitimate provider withdrawal, outages, or reporting changes
may still explain any case below.

A future historical cleaner may use a reviewed crawl-ID blacklist, but must not infer invalidity from
these conditions alone. Newly captured data is unaffected because fetch failures are explicit.

## Summary

| Missing retained crawls | Windows | Endpoints |
| ----------------------: | ------: | --------: |
|                       1 |      16 |        50 |
|                       2 |       2 |         4 |
|                       3 |       1 |         3 |
|                       4 |       2 |         7 |
|                       5 |       2 |         2 |
|               **Total** |  **23** |    **66** |

## Incidents

### 1. 1-crawl gap beginning 2025-10-22T08:11:02.682Z

- Disappeared between `1761117211811` (2025-10-22T07:13:31.811Z) and
  `1761120662682` (2025-10-22T08:11:02.682Z).
- Returned between `1761120662682` (2025-10-22T08:11:02.682Z) and `1761124296465`
  (2025-10-22T09:11:36.465Z).
- Affected endpoints: 17.

| Endpoint ID                            | Name                                            | Model variant slug |
| -------------------------------------- | ----------------------------------------------- | ------------------ |
| `14d6aeff-9fe4-4ad4-aaf4-a58b7fdd7a19` | Chutes \| qwen/qwen3-coder-480b-a35b-07-25      | `qwen/qwen3-coder` |
| `164f131f-d06c-434d-9413-5898dc97faa9` | DeepInfra \| qwen/qwen3-coder-480b-a35b-07-25   | `qwen/qwen3-coder` |
| `223e0b1b-e924-4da4-8d45-74cc9deeb40f` | Novita \| qwen/qwen3-coder-480b-a35b-07-25      | `qwen/qwen3-coder` |
| `358896de-ec71-4f5a-9a35-7fabaf7a244d` | AtlasCloud \| qwen/qwen3-coder-480b-a35b-07-25  | `qwen/qwen3-coder` |
| `4117a5d2-961b-4065-99dd-554484dc6443` | Fireworks \| qwen/qwen3-coder-480b-a35b-07-25   | `qwen/qwen3-coder` |
| `443141dd-d524-4980-bcd8-097b34ec0025` | Together \| qwen/qwen3-coder-480b-a35b-07-25    | `qwen/qwen3-coder` |
| `4f33da20-e1ed-4421-bdd6-c1503017e083` | Cerebras \| qwen/qwen3-coder-480b-a35b-07-25    | `qwen/qwen3-coder` |
| `54e9e63d-f0fe-47b2-9a4e-2139d8bee601` | GMICloud \| qwen/qwen3-coder-480b-a35b-07-25    | `qwen/qwen3-coder` |
| `6982ced0-1d3c-4fd0-bc36-21297218fdbe` | DeepInfra \| qwen/qwen3-coder-480b-a35b-07-25   | `qwen/qwen3-coder` |
| `7806a710-f20a-446c-9ef2-181ca46c1991` | BaseTen \| qwen/qwen3-coder-480b-a35b-07-25     | `qwen/qwen3-coder` |
| `78c02619-0533-4ed0-9c98-2acbed354856` | WandB \| qwen/qwen3-coder-480b-a35b-07-25       | `qwen/qwen3-coder` |
| `803d4906-0d0b-49b6-8705-7ae0a4d45217` | Google \| qwen/qwen3-coder-480b-a35b-07-25      | `qwen/qwen3-coder` |
| `9e1b542f-06a7-4d23-a5b4-615bdd78d952` | SiliconFlow \| qwen/qwen3-coder-480b-a35b-07-25 | `qwen/qwen3-coder` |
| `abdef935-3e39-46b2-a40e-fb5920f88abb` | Nebius \| qwen/qwen3-coder-480b-a35b-07-25      | `qwen/qwen3-coder` |
| `e39a782c-5c0d-4616-b2b6-59dec4038934` | Targon \| qwen/qwen3-coder-480b-a35b-07-25      | `qwen/qwen3-coder` |
| `eb365617-e7c9-41fa-98ea-a3aa2183ce58` | Alibaba \| qwen/qwen3-coder-480b-a35b-07-25     | `qwen/qwen3-coder` |
| `ebee417d-5f49-40f5-b1b3-3fc5f932b80d` | Hyperbolic \| qwen/qwen3-coder-480b-a35b-07-25  | `qwen/qwen3-coder` |

### 2. 1-crawl gap beginning 2025-12-02T18:12:16.167Z

- Disappeared between `1764695513109` (2025-12-02T17:11:53.109Z) and
  `1764699136167` (2025-12-02T18:12:16.167Z).
- Returned between `1764699136167` (2025-12-02T18:12:16.167Z) and `1764702807115`
  (2025-12-02T19:13:27.115Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                          | Model variant slug         |
| -------------------------------------- | --------------------------------------------- | -------------------------- |
| `3b5d6f4c-44dc-42d9-9fb6-cc6cdb020153` | Parasail \| allenai/olmo-3-32b-think-20251121 | `allenai/olmo-3-32b-think` |

### 3. 1-crawl gap beginning 2026-02-12T15:30:00.361Z

- Disappeared between `1770909000274` (2026-02-12T15:10:00.274Z) and
  `1770910200361` (2026-02-12T15:30:00.361Z).
- Returned between `1770910200361` (2026-02-12T15:30:00.361Z) and `1770911400313`
  (2026-02-12T15:50:00.313Z).
- Affected endpoints: 12.

| Endpoint ID                            | Name                          | Model variant slug    |
| -------------------------------------- | ----------------------------- | --------------------- |
| `227db9b5-e0d2-4053-9b23-fb3ad58e14ac` | Together \| z-ai/glm-4.6      | `z-ai/glm-4.6`        |
| `2a87c474-6f6a-457f-8d8c-2afc71fb9fad` | SiliconFlow \| z-ai/glm-4.6   | `z-ai/glm-4.6`        |
| `3971cf0a-5d2a-4938-b0e3-a5e480fdd9a3` | AtlasCloud \| z-ai/glm-4.6    | `z-ai/glm-4.6`        |
| `4929f6aa-3dc2-47ae-80fd-626ad6fd8199` | Friendli \| z-ai/glm-4.6      | `z-ai/glm-4.6`        |
| `4b6fe88c-7cc4-4c60-9f84-e8b831343567` | Ambient \| z-ai/glm-4.6       | `z-ai/glm-4.6`        |
| `5549acf8-9057-42a0-a617-069c1badeceb` | Chutes \| z-ai/glm-4.6        | `z-ai/glm-4.6`        |
| `562fe77f-c92f-4556-b43b-ea7da6891b6a` | Novita \| z-ai/glm-4.6        | `z-ai/glm-4.6`        |
| `a87bfa67-bad9-4ce3-8c20-99b61249cfc3` | Z.AI \| z-ai/glm-4.6          | `z-ai/glm-4.6`        |
| `c8607edc-8577-4199-b03d-1213da4743dc` | DeepInfra \| z-ai/glm-4.6     | `z-ai/glm-4.6`        |
| `df7ce709-f02d-469f-9178-d8c4c6b5ad42` | BaseTen \| z-ai/glm-4.6       | `z-ai/glm-4.6`        |
| `da732d48-44e7-404f-9e09-a8979896937a` | Novita \| z-ai/glm-4.6:exacto | `z-ai/glm-4.6:exacto` |
| `e50846db-5bc4-443f-af60-0d7032196803` | Z.AI \| z-ai/glm-4.6:exacto   | `z-ai/glm-4.6:exacto` |

### 4. 1-crawl gap beginning 2026-03-04T19:10:00.173Z

- Disappeared between `1772650200327` (2026-03-04T18:50:00.327Z) and
  `1772651400173` (2026-03-04T19:10:00.173Z).
- Returned between `1772651400173` (2026-03-04T19:10:00.173Z) and `1772652600353`
  (2026-03-04T19:30:00.353Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                        | Model variant slug                 |
| -------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `814f9be0-e226-4b8c-bb5d-bf684359da13` | Mistral \| mistralai/voxtral-small-24b-2507 | `mistralai/voxtral-small-24b-2507` |

### 5. 1-crawl gap beginning 2026-03-04T22:10:00.155Z

- Disappeared between `1772661000167` (2026-03-04T21:50:00.167Z) and
  `1772662200155` (2026-03-04T22:10:00.155Z).
- Returned between `1772662200155` (2026-03-04T22:10:00.155Z) and `1772663400198`
  (2026-03-04T22:30:00.198Z).
- Affected endpoints: 2.

| Endpoint ID                            | Name                                    | Model variant slug           |
| -------------------------------------- | --------------------------------------- | ---------------------------- |
| `8b6b26e9-621a-4b31-b55a-c9aaa7482ede` | DeepInfra \| qwen/qwen-2.5-72b-instruct | `qwen/qwen-2.5-72b-instruct` |
| `a2a8a9fd-2784-448f-99b8-076fb6e1d8e5` | Novita \| qwen/qwen-2.5-72b-instruct    | `qwen/qwen-2.5-72b-instruct` |

### 6. 1-crawl gap beginning 2026-03-12T08:50:00.318Z

- Disappeared between `1773304200284` (2026-03-12T08:30:00.284Z) and
  `1773305400318` (2026-03-12T08:50:00.318Z).
- Returned between `1773305400318` (2026-03-12T08:50:00.318Z) and `1773306600463`
  (2026-03-12T09:10:00.463Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                 | Model variant slug           |
| -------------------------------------- | ------------------------------------ | ---------------------------- |
| `75e64609-6b51-4e35-96ea-5065c6fbda63` | Novita \| baidu/ernie-4.5-vl-28b-a3b | `baidu/ernie-4.5-vl-28b-a3b` |

### 7. 1-crawl gap beginning 2026-03-12T09:30:01.086Z

- Disappeared between `1773306600463` (2026-03-12T09:10:00.463Z) and
  `1773307801086` (2026-03-12T09:30:01.086Z).
- Returned between `1773307801086` (2026-03-12T09:30:01.086Z) and `1773309000405`
  (2026-03-12T09:50:00.405Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                             | Model variant slug                   |
| -------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| `7f9cc99b-0c5c-4dc4-a662-07cebf628081` | Cloudflare \| mistralai/mistral-7b-instruct-v0.1 | `mistralai/mistral-7b-instruct-v0.1` |

### 8. 1-crawl gap beginning 2026-03-21T08:30:00.388Z

- Disappeared between `1774080600295` (2026-03-21T08:10:00.295Z) and
  `1774081800388` (2026-03-21T08:30:00.388Z).
- Returned between `1774081800388` (2026-03-21T08:30:00.388Z) and `1774083000141`
  (2026-03-21T08:50:00.141Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                   | Model variant slug       |
| -------------------------------------- | -------------------------------------- | ------------------------ |
| `c5a8bebe-8564-47ed-9d05-4151aa3c6e3a` | Mistral \| mistralai/mistral-saba-2502 | `mistralai/mistral-saba` |

### 9. 1-crawl gap beginning 2026-03-21T17:30:00.622Z

- Disappeared between `1774113000364` (2026-03-21T17:10:00.364Z) and
  `1774114200622` (2026-03-21T17:30:00.622Z).
- Returned between `1774114200622` (2026-03-21T17:30:00.622Z) and `1774115400312`
  (2026-03-21T17:50:00.312Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                         | Model variant slug        |
| -------------------------------------- | -------------------------------------------- | ------------------------- |
| `62189f7c-259a-4dc3-8e85-7769034f981c` | Parasail \| allenai/olmo-3-7b-think-20251121 | `allenai/olmo-3-7b-think` |

### 10. 1-crawl gap beginning 2026-03-24T07:30:00.285Z

- Disappeared between `1774336200511` (2026-03-24T07:10:00.511Z) and
  `1774337400285` (2026-03-24T07:30:00.285Z).
- Returned between `1774337400285` (2026-03-24T07:30:00.285Z) and `1774338600344`
  (2026-03-24T07:50:00.344Z).
- Affected endpoints: 2.

| Endpoint ID                            | Name                                   | Model variant slug  |
| -------------------------------------- | -------------------------------------- | ------------------- |
| `36b76b2b-0b8d-423c-9e90-a8bba875ef45` | Azure \| openai/gpt-5-nano-2025-08-07  | `openai/gpt-5-nano` |
| `50329d77-04e1-4979-a184-c33030289476` | OpenAI \| openai/gpt-5-nano-2025-08-07 | `openai/gpt-5-nano` |

### 11. 1-crawl gap beginning 2026-04-21T15:10:00.121Z

- Disappeared between `1776783000114` (2026-04-21T14:50:00.114Z) and
  `1776784200121` (2026-04-21T15:10:00.121Z).
- Returned between `1776784200121` (2026-04-21T15:10:00.121Z) and `1776785400146`
  (2026-04-21T15:30:00.146Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                 | Model variant slug          |
| -------------------------------------- | ------------------------------------ | --------------------------- |
| `06da462a-b61e-4621-8356-e585d8b4d618` | Stealth \| openrouter/elephant-alpha | `openrouter/elephant-alpha` |

### 12. 1-crawl gap beginning 2026-05-05T00:10:00.418Z

- Disappeared between `1777938600139` (2026-05-04T23:50:00.139Z) and
  `1777939800418` (2026-05-05T00:10:00.418Z).
- Returned between `1777939800418` (2026-05-05T00:10:00.418Z) and `1777941000167`
  (2026-05-05T00:30:00.167Z).
- Affected endpoints: 3.

| Endpoint ID                            | Name                                                    | Model variant slug                     |
| -------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `1c9b8776-e266-4efb-b5ba-19a6753e7736` | Google \| anthropic/claude-3-7-sonnet-20250219          | `anthropic/claude-3.7-sonnet`          |
| `cffd5c43-9924-4ca6-894d-ffc5e172eea3` | Google \| anthropic/claude-3-7-sonnet-20250219          | `anthropic/claude-3.7-sonnet`          |
| `aa1ee54a-c660-496a-8f2d-d8470ef3f11b` | Google \| anthropic/claude-3-7-sonnet-20250219:thinking | `anthropic/claude-3.7-sonnet:thinking` |

### 13. 1-crawl gap beginning 2026-05-07T00:10:00.126Z

- Disappeared between `1778111400132` (2026-05-06T23:50:00.132Z) and
  `1778112600126` (2026-05-07T00:10:00.126Z).
- Returned between `1778112600126` (2026-05-07T00:10:00.126Z) and `1778115000136`
  (2026-05-07T00:50:00.136Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                            | Model variant slug             |
| -------------------------------------- | ----------------------------------------------- | ------------------------------ |
| `b77648dc-8cb2-496b-a0f4-b1481ce5ac92` | Novita \| inclusionai/ling-2.6-1t-20260423:free | `inclusionai/ling-2.6-1t:free` |

### 14. 1-crawl gap beginning 2026-05-25T08:10:00.110Z

- Disappeared between `1779695400116` (2026-05-25T07:50:00.116Z) and
  `1779696600110` (2026-05-25T08:10:00.110Z).
- Returned between `1779696600110` (2026-05-25T08:10:00.110Z) and `1779697800281`
  (2026-05-25T08:30:00.281Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                              | Model variant slug                    |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| `aa43fede-ebc3-4e57-b148-8d92deef5100` | AtlasCloud \| alibaba/tongyi-deepresearch-30b-a3b | `alibaba/tongyi-deepresearch-30b-a3b` |

### 15. 1-crawl gap beginning 2026-05-31T12:30:00.115Z

- Disappeared between `1780229400110` (2026-05-31T12:10:00.110Z) and
  `1780230600115` (2026-05-31T12:30:00.115Z).
- Returned between `1780230600115` (2026-05-31T12:30:00.115Z) and `1780231800123`
  (2026-05-31T12:50:00.123Z).
- Affected endpoints: 4.

| Endpoint ID                            | Name                                      | Model variant slug             |
| -------------------------------------- | ----------------------------------------- | ------------------------------ |
| `8f47daf9-62e7-423d-96de-fcb241b39175` | Mistral \| mistralai/devstral-medium-2507 | `mistralai/devstral-medium`    |
| `768e136a-0758-4c83-b1a7-701cb57da9e7` | Mistral \| mistralai/devstral-small-2507  | `mistralai/devstral-small`     |
| `26f5ecd0-44cb-43e8-8cfc-7b155c2e8c05` | Mistral \| mistralai/mistral-large-2411   | `mistralai/mistral-large-2411` |
| `1a41639e-c1cf-422e-a871-27bc67f03928` | Mistral \| mistralai/pixtral-large-2411   | `mistralai/pixtral-large-2411` |

### 16. 1-crawl gap beginning 2026-06-08T13:30:00.737Z

- Disappeared between `1780924200452` (2026-06-08T13:10:00.452Z) and
  `1780925400737` (2026-06-08T13:30:00.737Z).
- Returned between `1780925400737` (2026-06-08T13:30:00.737Z) and `1780926600626`
  (2026-06-08T13:50:00.626Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                        | Model variant slug             |
| -------------------------------------- | ------------------------------------------- | ------------------------------ |
| `220ae074-7efe-45b9-b305-b23ad6c641c7` | SiliconFlow \| nex-agi/deepseek-v3.1-nex-n1 | `nex-agi/deepseek-v3.1-nex-n1` |

### 17. 2-crawl gap beginning 2026-01-24T14:30:01.649Z

- Disappeared between `1769263800378` (2026-01-24T14:10:00.378Z) and
  `1769265001649` (2026-01-24T14:30:01.649Z).
- Returned between `1769266200508` (2026-01-24T14:50:00.508Z) and `1769267400514`
  (2026-01-24T15:10:00.514Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                       | Model variant slug       |
| -------------------------------------- | ------------------------------------------ | ------------------------ |
| `38c32567-be85-4c82-a6d8-592a4158d436` | Minimax \| minimax/minimax-m2-her-20260123 | `minimax/minimax-m2-her` |

### 18. 2-crawl gap beginning 2026-06-06T15:10:00.731Z

- Disappeared between `1780757400320` (2026-06-06T14:50:00.320Z) and
  `1780758600731` (2026-06-06T15:10:00.731Z).
- Returned between `1780759800749` (2026-06-06T15:30:00.749Z) and `1780761000530`
  (2026-06-06T15:50:00.530Z).
- Affected endpoints: 3.

| Endpoint ID                            | Name                                 | Model variant slug           |
| -------------------------------------- | ------------------------------------ | ---------------------------- |
| `a9b3fe6f-e21f-4f3c-9ea7-f70d856939d6` | Together \| arcee-ai/spotlight       | `arcee-ai/spotlight`         |
| `75e64609-6b51-4e35-96ea-5065c6fbda63` | Novita \| baidu/ernie-4.5-vl-28b-a3b | `baidu/ernie-4.5-vl-28b-a3b` |
| `8744de26-f64f-41cf-bd0e-950a83d1a923` | OpenAI \| openai/gpt-4-1106-preview  | `openai/gpt-4-1106-preview`  |

### 19. 3-crawl gap beginning 2026-02-19T05:30:00.404Z

- Disappeared between `1771477800317` (2026-02-19T05:10:00.317Z) and
  `1771479000404` (2026-02-19T05:30:00.404Z).
- Returned between `1771481400388` (2026-02-19T06:10:00.388Z) and `1771482600443`
  (2026-02-19T06:30:00.443Z).
- Affected endpoints: 3.

| Endpoint ID                            | Name                                          | Model variant slug            |
| -------------------------------------- | --------------------------------------------- | ----------------------------- |
| `b1b489e5-7029-4ab2-9e12-5415b55b4afa` | Amazon Bedrock \| amazon/nova-2-lite-v1       | `amazon/nova-2-lite-v1`       |
| `d4fb79bd-9786-4932-af81-b83040e9f4e4` | Amazon Bedrock \| anthropic/claude-3.5-sonnet | `anthropic/claude-3.5-sonnet` |
| `c684c4e7-1b77-4ca5-9516-7ecc66e2c455` | Amazon Bedrock \| writer/palmyra-x5-20250428  | `writer/palmyra-x5`           |

### 20. 4-crawl gap beginning 2025-09-04T16:11:31.173Z

- Disappeared between `1756998680435` (2025-09-04T15:11:20.435Z) and
  `1757002291173` (2025-09-04T16:11:31.173Z).
- Returned between `1757013171963` (2025-09-04T19:12:51.963Z) and `1757016754896`
  (2025-09-04T20:12:34.896Z).
- Affected endpoints: 3.

| Endpoint ID                            | Name                                   | Model variant slug     |
| -------------------------------------- | -------------------------------------- | ---------------------- |
| `72eda073-d180-4482-8e4f-81051cb66f7e` | Amazon Bedrock \| amazon/nova-lite-v1  | `amazon/nova-lite-v1`  |
| `474f0074-66f9-42f0-a866-81a2ffebb001` | Amazon Bedrock \| amazon/nova-micro-v1 | `amazon/nova-micro-v1` |
| `959381a4-8054-450f-9daf-5fcab64ba9aa` | Amazon Bedrock \| amazon/nova-pro-v1   | `amazon/nova-pro-v1`   |

### 21. 4-crawl gap beginning 2026-02-19T05:10:00.317Z

- Disappeared between `1771476600519` (2026-02-19T04:50:00.519Z) and
  `1771477800317` (2026-02-19T05:10:00.317Z).
- Returned between `1771481400388` (2026-02-19T06:10:00.388Z) and `1771482600443`
  (2026-02-19T06:30:00.443Z).
- Affected endpoints: 4.

| Endpoint ID                            | Name                                     | Model variant slug       |
| -------------------------------------- | ---------------------------------------- | ------------------------ |
| `72eda073-d180-4482-8e4f-81051cb66f7e` | Amazon Bedrock \| amazon/nova-lite-v1    | `amazon/nova-lite-v1`    |
| `474f0074-66f9-42f0-a866-81a2ffebb001` | Amazon Bedrock \| amazon/nova-micro-v1   | `amazon/nova-micro-v1`   |
| `6e4da481-6c8d-45d0-a3f5-11a9ba527485` | Amazon Bedrock \| amazon/nova-premier-v1 | `amazon/nova-premier-v1` |
| `959381a4-8054-450f-9daf-5fcab64ba9aa` | Amazon Bedrock \| amazon/nova-pro-v1     | `amazon/nova-pro-v1`     |

### 22. 5-crawl gap beginning 2025-08-22T14:12:52.099Z

- Disappeared between `1755868212332` (2025-08-22T13:10:12.332Z) and
  `1755871972099` (2025-08-22T14:12:52.099Z).
- Returned between `1755886215323` (2025-08-22T18:10:15.323Z) and `1755890025797`
  (2025-08-22T19:13:45.797Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                  | Model variant slug        |
| -------------------------------------- | ------------------------------------- | ------------------------- |
| `eeafabf0-4611-4394-8251-76397dcdae95` | AtlasCloud \| openai/gpt-oss-20b:free | `openai/gpt-oss-20b:free` |

### 23. 5-crawl gap beginning 2026-03-31T00:10:00.133Z

- Disappeared between `1774914600131` (2026-03-30T23:50:00.131Z) and
  `1774915800133` (2026-03-31T00:10:00.133Z).
- Returned between `1774920600176` (2026-03-31T01:30:00.176Z) and `1774921800131`
  (2026-03-31T01:50:00.131Z).
- Affected endpoints: 1.

| Endpoint ID                            | Name                                            | Model variant slug                    |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| `239c00d5-c404-4d17-b243-6a645212dc95` | Arcee AI \| arcee-ai/trinity-large-preview:free | `arcee-ai/trinity-large-preview:free` |
