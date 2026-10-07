import { internal } from '@orca/backend/api'
import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

const [deploymentArg, destinationKey = 'orca-dev-3', secondDestination = 'orca-dev-4'] =
  process.argv.slice(2)
function selectedDeployment(): string {
  if (deploymentArg === undefined) {
    throw new Error(
      'Usage: bun packages/scripts/discord-demo.ts <dev-deployment> [first-destination] [second-destination]',
    )
  }
  return deploymentArg
}
const deployment = selectedDeployment()
const backend = new URL('../backend/', import.meta.url).pathname
const startedAt = Date.now()
const prefix = `delivery-demo-${startedAt}`
const { outbox } = internal.alerts.discord

type InternalFunction = FunctionReference<'query' | 'mutation', 'internal'>
async function run<F extends InternalFunction>(
  fn: F,
  args: FunctionArgs<F>,
): Promise<FunctionReturnType<F>> {
  const child = Bun.spawn(
    [
      'bun',
      'run',
      'convex',
      'run',
      getFunctionName(fn),
      JSON.stringify(args),
      '--deployment',
      deployment,
    ],
    { cwd: backend, stderr: 'pipe', stdout: 'pipe' },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) {
    throw new Error(`${getFunctionName(fn)} failed: ${stderr}`)
  }
  const result: unknown = stdout.trim() === '' ? null : JSON.parse(stdout)
  return result
}
function payload(content: string) {
  return JSON.stringify({ allowed_mentions: { parse: [] }, content })
}
function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}
async function waitForGroup(groupId: string, expected = 'succeeded') {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const view = await run(outbox.group, { groupId })
    if (view !== null && ['succeeded', 'failed', 'expired'].includes(view.task.status)) {
      check(
        view.task.status === expected,
        `Expected ${expected}, got ${view.task.status}: ${view.task.reason ?? ''}`,
      )
      return view
    }
    await Bun.sleep(500)
  }
  throw new Error(`Timed out waiting for group ${groupId}`)
}
async function firstMessage(groupId: string) {
  const messages = await run(outbox.messages, { groupId })
  const [first] = messages
  if (first === undefined) {
    throw new Error('Missing queued message')
  }
  return first
}

console.log(
  `Demo ${prefix}, deployment ${deployment}, destinations ${destinationKey} and ${secondDestination}`,
)
await run(outbox.pause, { paused: true })
const later = await run(outbox.enqueue, {
  destinationKey: secondDestination,
  key: `${prefix}:later`,
  messages: [
    { key: 'header', payload: payload(`[${prefix}] Later group — header (1/3)`) },
    {
      key: 'body',
      payload: JSON.stringify({
        allowed_mentions: { parse: [] },
        components: [
          { components: [{ content: `[${prefix}] Components V2 body (2/3)`, type: 10 }], type: 17 },
        ],
        flags: 32_768,
      }),
    },
    { key: 'footer', payload: payload(`[${prefix}] Later group — footer (3/3)`) },
  ],
  sendAt: startedAt - 1000,
})
const earlierArgs = {
  destinationKey,
  key: `${prefix}:earlier`,
  messages: [
    { key: 'header', payload: payload(`[${prefix}] Earlier group — header (1/3)`) },
    {
      key: 'body',
      payload: payload(`[${prefix}] This body will be edited, fetched and deleted (2/3)`),
    },
    { key: 'footer', payload: payload(`[${prefix}] Earlier group — footer (3/3)`) },
  ],
  sendAt: startedAt - 2000,
}
const earlier = await run(outbox.enqueue, earlierArgs)
const duplicate = await run(outbox.enqueue, earlierArgs)
check(earlier === duplicate, 'Identical submission was not deduplicated')
const expired = await run(outbox.enqueue, {
  destinationKey,
  key: `${prefix}:expired`,
  maxAgeMs: 3_600_000,
  messages: [
    { key: 'expired', payload: payload(`[${prefix}] This expired message must never be sent`) },
  ],
  sendAt: startedAt - 7_200_000,
})
const invalid = await run(outbox.enqueue, {
  deadLetterDestinationKey: secondDestination,
  destinationKey,
  key: `${prefix}:invalid`,
  messages: [
    { key: 'invalid', payload: payload('x'.repeat(2100)) },
    {
      key: 'unreached-footer',
      payload: payload(`[${prefix}] Failed-group footer must never be sent`),
    },
  ],
  sendAt: startedAt,
})
await run(outbox.pause, { paused: false })
await waitForGroup(earlier)
await waitForGroup(later)
await waitForGroup(expired, 'expired')
await waitForGroup(invalid, 'failed')
const expiredMessage = await firstMessage(expired)
const expiredAttempts = await run(outbox.attempts, { messageId: expiredMessage.message._id })
check(expiredAttempts.length === 0, 'Expired message reached the HTTP sender')
const earlyMessages = await run(outbox.messages, { groupId: earlier })
const laterMessages = await run(outbox.messages, { groupId: later })
check(earlyMessages.length === 3 && laterMessages.length === 3, 'Group message count changed')
const earlyEnd = earlyMessages.at(-1)?.result?.completedAt
const laterStartAttempts = await run(outbox.attempts, { messageId: laterMessages[0]?.message._id })
const laterStart = laterStartAttempts.at(-1)?.attempt.startedAt
check(
  earlyEnd !== undefined && laterStart !== undefined && earlyEnd <= laterStart,
  'Groups interleaved or chronological order was lost',
)
const [, managedMessage] = earlyMessages
if (managedMessage === undefined) {
  throw new Error('Missing message to manage')
}
const messageId = managedMessage.message._id
const get = await run(outbox.manage, { key: `${prefix}:get`, messageId, operation: 'get' })
await waitForGroup(get)
const editContent = `[${prefix}] Edited successfully through the durable sender`
const edit = await run(outbox.manage, {
  key: `${prefix}:edit`,
  messageId,
  operation: 'edit',
  payload: payload(editContent),
})
await waitForGroup(edit)
const readBack = await run(outbox.manage, {
  key: `${prefix}:read-back`,
  messageId,
  operation: 'get',
})
await waitForGroup(readBack)
const readResult = await firstMessage(readBack)
check(
  readResult.result?.response.body.includes(editContent) === true,
  'Discord did not return the edited content',
)
const deletion = await run(outbox.manage, {
  key: `${prefix}:delete`,
  messageId,
  operation: 'delete',
})
await waitForGroup(deletion)
const afterDelete = await run(outbox.manage, {
  key: `${prefix}:after-delete`,
  messageId,
  operation: 'get',
})
await waitForGroup(afterDelete, 'failed')
const deletedResult = await firstMessage(afterDelete)
check(deletedResult.result?.response.status === 404, 'Deleted Discord message still exists')
const deadLetters = await run(outbox.groups, { key: `dead-letter:${invalid}` })
const [deadLetter] = deadLetters
if (deadLetter === undefined) {
  throw new Error('Missing dead-letter group')
}
await waitForGroup(deadLetter.group._id)
const report = {
  capturedAt: new Date().toISOString(),
  checks: {
    chronologicalGroups: true,
    deadLetterForwarded: true,
    deduplication: true,
    deleted: true,
    deletionConfirmed404: true,
    edited: true,
    expiryWithoutRequest: true,
    fetched: true,
    partialFailure: true,
  },
  deployment,
  destinations: [destinationKey, secondDestination],
  groups: {
    afterDelete,
    deadLetter: deadLetter.group._id,
    deletion,
    earlier,
    edit,
    expired,
    get,
    invalid,
    later,
    readBack,
  },
  population: prefix,
  retainedReceipts: [...earlyMessages, ...laterMessages].map(({ message, result }) => ({
    completedAt: result?.completedAt,
    discordMessageId: result?.response.messageId,
    key: message.key,
    messageId: message._id,
  })),
}
const reportPath = new URL('../../docs/orca/discord-demo.json', import.meta.url)
await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
