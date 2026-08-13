export {
  EventBus,
  createBus,
} from './bus';
export type {
  BridgePort,
  BroadcastPort,
  BusDeps,
  BusOptions,
  BusMiddleware,
  HooksPort,
  NotifyPort,
} from './bus';

export {
  defineContract,
} from './contract';
export type {
  Contract,
  ContractDef,
  EventMap,
  EventPayload,
  HookDef,
  HookMap,
  HookPayload,
  HookStrategy,
  WildcardHandler,
} from './contract';

export {
  isSchema,
  validatePayload,
  formatIssues,
} from './schema';
export type {
  Schema,
  SchemaOutput,
  ValidationMode,
  ValidationResult,
  ValidationOk,
  ValidationFail,
} from './schema';

export {
  newId,
  createMeta,
} from './tracing';
export type {
  EventMeta,
  EmitOptions,
  EventOrigin,
} from './tracing';

export {
  HookEngine,
} from './hooks';
export type {
  HookTapFn,
  HookTapPromiseFn,
  HookContext,
} from './hooks';

export { NotifyBus } from './notify';

export {
  Bridge,
  getBridgeRegistry,
  GLOBAL_KEY,
  GLOBAL_KEY as BRIDGE_GLOBAL_KEY,
} from './bridge';
export type {
  BridgeOptions,
  BridgeBusAdapter,
  BridgeRegistry,
  PublicBridge,
  ExternalHandler,
} from './bridge';

export { Broadcast } from './broadcast';
export type { BroadcastOptions, BroadcastMessage } from './broadcast';

export {
  EventBusError,
  EventValidationError,
  UnknownEventError,
  UnknownHookError,
  HookError,
} from './errors';
export type { EventBusErrorCode } from './errors';
