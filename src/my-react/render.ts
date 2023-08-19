interface Fiber {
    type?: any
    props: any
    dom?: HTMLElement | Text | null
    parent?: Fiber | null
    alternate?: Fiber | null
    child?: Fiber | null
    sibling?: Fiber | null
    effectTag?: "PLACEMENT" | "DELETION" | "UPDATE"
    hooks?: FunctionComponentHook[]
}

interface FunctionComponentHook {
    state: any
    queue: Function[]
}

interface Props {
    [key: string]: any
}

function createDOM(fiber: Fiber): Text | HTMLElement {
    const dom = fiber.type === "TEXT_ELEMENT" ? document.createTextNode("") : document.createElement(fiber.type)
    Object.keys(fiber.props)
        .filter(key => key !== "children")
        .forEach(key => {
            dom[key] = fiber.props[key]
        })
    return dom
}

let nextUnitOfWork: Fiber | null = null
let wipRoot: Fiber | null = null
let currentRoot: Fiber | null = null
let deletion: Fiber[] = []

function render(element: Element, container: HTMLElement) {
    let deletions: Fiber[] = []
    wipRoot = {
        dom: container,
        props: {
            children: [element]
        },
        child: null,
        alternate: currentRoot
    }
    nextUnitOfWork = wipRoot
    deletions = []
}

function commitRoot() {
    let deletion: Fiber[] = []
    deletion.forEach(item => {
        commitWork(item)
    })
    commitWork(wipRoot!.child)
    currentRoot = wipRoot
    wipRoot = null
}

function updateDOM(dom: any, prevProps: Props, nextProps: Props) {
    const isEvent = (key: string) => key.startsWith("on")
    // 删除旧props
    Object.keys(prevProps)
        .filter(key => key !== "children" && !isEvent(key))
        .filter(key => !(key in nextProps))
        .forEach(key => {
            dom[key] = ""
        })
    // 设置新props
    Object.keys(nextProps)
        .filter(key => key !== "children" && !isEvent(key))
        .filter(key => !(key in prevProps) || prevProps[key] !== nextProps[key])
        .forEach(key => {
            dom[key] = nextProps[key]
        })
    // 删除旧事件
    Object.keys(prevProps)
        .filter(isEvent)
        .filter(key => !(key in nextProps) || prevProps[key] !== nextProps[key])
        .forEach(key => {
            const eventType = key.toLowerCase().substring(2)
            dom?.removeEventListener(eventType, prevProps[key])
        })
    // 添加新事件
    Object.keys(nextProps)
        .filter(isEvent)
        .filter(key => !(key in prevProps) || prevProps[key] !== nextProps[key])
        .forEach(key => {
            const eventType = key.toLowerCase().substring(2)
            dom?.addEventListener(eventType, nextProps[key])
        })
}

// 调度
function workLoop(deadline: any) {
    // shouldYield 表示线程繁忙，应该中断渲染
    let shouldYield = false
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
        // 检查线程是否繁忙
        shouldYield = deadline.timeRemaining() < 1
    }

    if (!nextUnitOfWork && wipRoot) {
        commitRoot()
    }

    // 重新请求
    requestIdleCallback(workLoop)
}

// 请求在空闲时执行渲染
requestIdleCallback(workLoop)

function commitWork(fiber?: Fiber | null) {
    if (!fiber) {
        return
    }

    let domParentFiber: Fiber = fiber.parent!

    while (!domParentFiber.dom) {
        domParentFiber = domParentFiber.parent!
    }

    const domParent = domParentFiber.dom

    if (fiber.effectTag === "PLACEMENT" && fiber.dom) {
        domParent.appendChild(fiber.dom)
    } else if (fiber.effectTag === "DELETION" && fiber.dom) {
        commitDeletion(fiber, domParent)
    } else if (fiber.effectTag === "UPDATE" && fiber.dom) {
        updateDOM(fiber.dom, fiber.alternate!.props, fiber.props)
    }

    commitWork(fiber.child)
    commitWork(fiber.sibling)
}

function commitDeletion(fiber: Fiber, domParent: HTMLElement | Text) {
    if (fiber.dom) {
        domParent.removeChild(fiber.dom)
    } else {
        commitDeletion(fiber.child!, domParent)
    }
}

function performUnitOfWork(fiber: Fiber): Fiber | null {
    const isFunctionComponent = typeof fiber.type === "function"

    if (isFunctionComponent) {
        updateFunctionComponent(fiber)
    } else {
        updateHostComponent(fiber)
    }

    if (fiber.child) {
        return fiber.child
    }

    let nextFiber: Fiber | null | undefined = fiber

    while (nextFiber) {
        if (nextFiber.sibling) {
            return nextFiber.sibling
        }
        nextFiber = nextFiber.parent
    }

    return null
}

let wipFiber: Fiber | null = null
let hookIndex: number = 0

function updateFunctionComponent(fiber: Fiber) {
    wipFiber = fiber
    hookIndex = 0
    wipFiber.hooks = []

    const children = [fiber.type(fiber.props)]

    reconcileChildren(fiber, children)
}

// 处理非函数式组件
function updateHostComponent(fiber: Fiber) {
    // 新建DOM元素
    if (!fiber.dom) {
        fiber.dom = createDOM(fiber)
    }

    reconcileChildren(fiber, fiber.props.children)
}

interface Element {
    type: any
    props: any
}

interface Hook {
    state: any
    queue: SetStateAction[]
}

type SetStateAction = (prevState: any) => any

interface Action {
    (prevState: any): any
}

export function useState<T>(init: T) {
    // 旧hook
    const oldHook: Hook | undefined | FunctionComponentHook = wipFiber?.alternate?.hooks?.[hookIndex]

    //  新hook
    const hook: Hook = {
        state: oldHook?.state ?? init,
        queue: []
    }

    // 执行actions，并且更新state
    const actions: Function[] = oldHook?.queue ?? []
    actions.forEach(action => {
        hook.state = action(hook.state)
    })

    const setState = (action: Action) => {
        hook.queue.push(action)
        // 重新设定wipRoot，触发渲染更新
        // 重新render
        wipRoot = {
            dom: currentRoot?.dom,
            props: currentRoot?.props,
            alternate: currentRoot
        }
        nextUnitOfWork = wipRoot
        deletion = []
    }

    wipFiber?.hooks?.push(hook)
    hookIndex++
    return [hook.state, setState]
}

function reconcileChildren(wipFiber: Fiber, elements: Element[]) {
    let index = 0
    let oldFiber: Fiber | undefined | null = wipFiber.alternate && wipFiber.alternate.child
    let prevSibling: Fiber | null = null

    while (index < elements.length || oldFiber != null) {
        const element = elements[index]

        const sameType = oldFiber != null && element != null && oldFiber.type === element.type

        let newFiber: Fiber | null = null

        if (sameType) {
            newFiber = {
                type: oldFiber?.type,
                props: element.props,
                dom: oldFiber?.dom,
                parent: wipFiber,
                alternate: oldFiber,
                effectTag: "UPDATE"
            }
        }

        if (element && !sameType) {
            newFiber = {
                type: element.type,
                props: element.props,
                dom: null,
                parent: wipFiber,
                alternate: null,
                effectTag: "PLACEMENT"
            }
        }

        if (oldFiber && !sameType) {
            oldFiber.effectTag = "DELETION"
            deletion.push(oldFiber)
        }

        if (oldFiber) {
            oldFiber = oldFiber.sibling
        }

        if (index === 0) {
            wipFiber.child = newFiber
        } else {
            prevSibling!.sibling = newFiber
        }

        prevSibling = newFiber
        index++
    }
}

export default render
