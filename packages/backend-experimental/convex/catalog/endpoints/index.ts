import { commit, markUnavailable } from './commit'
import { get, history, list, listForModel, listStates } from './queries'

export const endpoints = {
  commit,
  get,
  history,
  list,
  listForModel,
  listStates,
  markUnavailable,
} as const
