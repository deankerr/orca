import { commit, markUnavailable } from './commit'
import { get, history, list, listStates } from './queries'

export const models = {
  commit,
  get,
  history,
  list,
  listStates,
  markUnavailable,
} as const
