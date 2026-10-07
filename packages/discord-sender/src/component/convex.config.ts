import workpool from '@convex-dev/workpool/convex.config.js'
import { defineComponent } from 'convex/server'

const component = defineComponent('discordSender')
component.use(workpool)
export default component
