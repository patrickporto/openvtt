/**
 * Fakes de DOM para testes headless em bun — o @openvtt/canvas define Web
 * Components (`class extends HTMLElement`) no escopo de módulo, então este
 * módulo deve ser o primeiro import de qualquer teste que o carregue.
 *
 * Apenas `HTMLElement`/`customElements` são instalados no escopo de módulo
 * (necessários no momento do import). O fake de `document` NÃO deve existir
 * fora do ciclo de um teste: o Bridge do @openvtt/events despacha CustomEvents
 * em `globalThis.document` quando presente, e um fake permanente quebraria
 * testes de outros pacotes no mesmo processo.
 */
const globalScope = globalThis as unknown as Record<string, unknown>;

if (typeof globalScope.HTMLElement === 'undefined') {
  globalScope.HTMLElement = class FakeHTMLElement {};
}
if (typeof globalScope.customElements === 'undefined') {
  globalScope.customElements = { get: () => undefined, define: () => {} };
}

/** Instala um fake de document para o ciclo do teste corrente. */
export function installDocumentFake(): void {
  if (typeof globalScope.document !== 'undefined') return;
  const fakeElement = () => ({ getContext: () => null, width: 0, height: 0, style: {} });
  globalScope.document = {
    createElement: () => fakeElement(),
    createElementNS: () => fakeElement(),
  };
}

/** Remove o fake de document instalado por installDocumentFake(). */
export function removeDocumentFake(): void {
  const document = globalScope.document as { createElement?: unknown } | undefined;
  if (document && typeof document.createElement === 'function') {
    delete globalScope.document;
  }
}
