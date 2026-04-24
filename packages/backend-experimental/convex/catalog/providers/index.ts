import { commit, markUnavailable } from './commit'
import { history, get, list, listStates } from './queries'

export const providers = {
  commit,
  get,
  history,
  list,
  listStates,
  markUnavailable,
} as const
