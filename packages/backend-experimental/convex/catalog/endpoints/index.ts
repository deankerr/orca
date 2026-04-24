import { commit, markUnavailable } from './commit'
import { history, get, list, listStates } from './queries'

export const endpoints = {
  commit,
  get,
  history,
  list,
  listStates,
  markUnavailable,
} as const
