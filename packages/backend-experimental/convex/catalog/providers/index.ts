import { commit, markUnavailable } from './commit'
import { get, history, list, listStates } from './queries'

export const providers = {
  commit,
  get,
  history,
  list,
  listStates,
  markUnavailable,
} as const
