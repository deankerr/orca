import batchWorker from '@convex-dev/batch-worker/convex.config.js'
import { defineComponent } from 'convex/server'

const component = defineComponent('discordDelivery')
component.use(batchWorker)
export default component
