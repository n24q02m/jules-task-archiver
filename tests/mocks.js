/**
 * Creates a mock DOM element with basic functionality.
 */
function createMockElement(tag = 'div', attrs = {}) {
  const element = {
    tagName: tag.toUpperCase(),
    attributes: { ...attrs },
    dataset: attrs.dataset || {},
    classList: {
      classes: new Set(),
      toggle: (cls, val) => {
        if (val === undefined) {
          if (element.classList.classes.has(cls)) element.classList.classes.delete(cls)
          else element.classList.classes.add(cls)
        } else if (val) {
          element.classList.classes.add(cls)
        } else {
          element.classList.classes.delete(cls)
        }
      },
      add: (cls) => element.classList.classes.add(cls),
      contains: (cls) => element.classList.classes.has(cls)
    },
    setAttribute: (name, val) => {
      element.attributes[name] = val
    },
    getAttribute: (name) => element.attributes[name],
    removeAttribute: (name) => {
      delete element.attributes[name]
    },
    addEventListener: (type, cb) => {
      if (!element.listeners) element.listeners = {}
      if (!element.listeners[type]) element.listeners[type] = []
      element.listeners[type].push(cb)
    },
    dispatchEvent: (type) => {
      if (element.listeners?.[type]) {
        element.listeners[type].forEach((cb) => {
          cb({ target: element })
        })
      }
    },
    style: { display: '' },
    appendChild: (child) => {
      if (!element.children) element.children = []
      if (child.nodeType === 11) {
        // DocumentFragment
        child.children.forEach((c) => {
          element.children.push(c)
          c.parentElement = element
        })
        child.children = [] // Clear fragment
      } else {
        element.children.push(child)
        child.parentElement = element
      }
    },
    remove: () => {
      if (element.parentElement?.children) {
        element.parentElement.children = element.parentElement.children.filter((c) => c !== element)
      }
    },
    querySelectorAll: (_sel) => [],
    querySelector: (_sel) => null,
    focus: () => {
      element.focused = true
    },
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    focused: false,
    scrollHeight: 0,
    scrollTop: 0
  }
  return element
}

/**
 * Creates a mock Chrome extension API.
 */
function createMockChrome(syncStorage, localStorage, sessionStorage, listeners) {
  return {
    storage: {
      sync: {
        get: (keys, cb) => {
          const res = {}
          const kArray = Array.isArray(keys) ? keys : [keys]
          kArray.forEach((k) => {
            if (syncStorage[k] !== undefined) res[k] = syncStorage[k]
          })
          cb(res)
        },
        set: (obj, cb) => {
          Object.assign(syncStorage, obj)
          if (cb) cb()
        },
        remove: (key, cb) => {
          delete syncStorage[key]
          if (cb) cb()
        }
      },
      local: {
        get: (keys, cb) => {
          const res = {}
          const kArray = Array.isArray(keys) ? keys : [keys]
          kArray.forEach((k) => {
            if (localStorage[k] !== undefined) res[k] = localStorage[k]
          })
          cb(res)
        },
        set: (obj, cb) => {
          Object.assign(localStorage, obj)
          if (cb) cb()
        }
      },
      session: {
        get: (keys, cb) => {
          const res = {}
          const kArray = Array.isArray(keys) ? keys : [keys]
          kArray.forEach((k) => {
            if (sessionStorage[k] !== undefined) res[k] = sessionStorage[k]
          })
          cb(res)
        }
      },
      onChanged: {
        addListener: (cb) => listeners.storage.push(cb)
      }
    },
    runtime: {
      sendMessage: (msg, cb) => {
        if (cb) {
          if (msg.action === 'GET_STATE') cb({ status: 'idle' })
          else cb()
        }
      },
      onMessage: {
        addListener: (cb) => listeners.runtime.push(cb)
      }
    },
    tabs: {
      query: (_opts) => Promise.resolve([{ id: 123 }])
    }
  }
}

/**
 * Creates a mock Document object.
 */
function createMockDocument(elements, opModeButtons, radioStates) {
  return {
    querySelector: (sel) => {
      if (radioStates) {
        if (sel === 'input[name="mode"]:checked') return { value: radioStates.mode }
        if (sel === 'input[name="scope"]:checked') return { value: radioStates.scope }
      }
      if (elements?.[sel]) return elements[sel]
      return createMockElement()
    },
    querySelectorAll: (sel) => {
      if (sel === '#opMode button' && opModeButtons) {
        return {
          forEach: (cb) => opModeButtons.forEach(cb)
        }
      }
      return { forEach: () => {} }
    },
    createElement: (tag) => createMockElement(tag),
    createDocumentFragment: () => {
      const frag = createMockElement('documentfragment')
      frag.nodeType = 11
      return frag
    },
    addEventListener: () => {}
  }
}

module.exports = {
  createMockElement,
  createMockChrome,
  createMockDocument
}
