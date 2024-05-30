import { BehaviorSubject, combineLatest } from 'https://cdn.jsdelivr.net/npm/rxjs@7.8.1/+esm';

const STREAM = 'https://common.tools/stream-binding.schema.json'
const CELL = 'https://common.tools/cell-binding.schema.json'

function createElement(node, context) {
  if (typeof node === 'string') {
    const textNode = document.createTextNode(node);
    return textNode;
  }

  if (!node || typeof node !== 'object') return null;

  // Handle text nodes
  if (!node.tag && node.$id && node.name) {
    // Bind the reactive source to update the text node if it changes
    if (context[node.name] && context[node.name].subscribe) {
      if (node.type == 'slot') {
        const uiNode = createElement(context[node.name].getValue(), context)
        context[node.name].subscribe(newValue => {
          uiNode.innerHTML = '';
          uiNode.appendChild(createElement(newValue, context));
        });
        return uiNode;
      } else {
        const textNode = document.createTextNode(context[node.name] || '');
        context[node.name].subscribe(newValue => {
          textNode.textContent = newValue;
        });
        return textNode;
      }
    }
  }

  // Handle element nodes
  if (!node.tag && node.type == 'repeat') {
    const container = document.createElement('div');
    const items = context[node.binding] || [];
    items.forEach(item => {
      container.appendChild(createElement(node.template, item));
    });
    return container
  }

  const element = document.createElement(node.tag);

  // Set properties
  for (const [key, value] of Object.entries(node.props || {})) {
    if (typeof value === 'object' && value.type) {
      // Handle specific types and bind reactive sources from context
      if (value.type && value["$id"] && value["$id"] === CELL) {
        let name = value.name || key;
        if (!context[name]) continue;
        element[key] = context[name].getValue();
        context[name].subscribe(newValue => element[key] = newValue);
      } else {
        if (value.binding) {
          element[key] = context[value.binding];
        }
      }
    } else if (value["$id"] && value["$id"] === STREAM && value.name) {
      // Handle event binding to a stream
      if (context[value.name]) {
        element.addEventListener(key, context[value.name]);
      }
    } else {
      element[key] = value;
    }
  }

  let children = node.children || [];
  if (!Array.isArray(children)) {
    children = [children];
  }

  // Recursively create and append child elements
  children.forEach(childNode => {
    if (childNode.binding && childNode.type == 'literal') {
      const node = document.createTextNode(context[childNode.binding])
      element.appendChild(node);
      return
    }

    const childElement = createElement(childNode, context);
    if (childElement) {
      element.appendChild(childElement);
    }
  });

  return element;
}

// Example usage with a simplified system.get function
const system = {
  get: (key) => {
    if (key === 'todos') {
      return [
        { label: 'Buy groceries', checked: false },
        { label: 'Vacuum house', checked: true },
        { label: 'Learn RxJS', checked: false }
      ];
    }
    return [];
  }
};

// Function to create the RxJS network from the new JSON graph format
function createRxJSNetworkFromJson(graph) {
  const context = {
    inputs: {},
    outputs: {}
  };

  // Create subjects for each node
  graph.nodes.forEach(node => {
    const nodeName = node.definition.name;
    context.outputs[nodeName] = new BehaviorSubject(null);

    // foreach input in the signature, create a subject
    if (node.definition.signature) {
      const { inputs } = node.definition.signature;
      context.inputs[nodeName] = {};
      for (const inputName in inputs) {
        context.inputs[nodeName][inputName] = new BehaviorSubject(null);
      }
    }
  });

  // Set up reactive bindings based on edges
  graph.edges.forEach(edge => {
    const [source, target] = Object.entries(edge)[0];
    const sourceSubject = context.outputs[source];
    const targetSubject = context.inputs[target[0]][target[1]];

    sourceSubject.subscribe(value => {
      targetSubject.next(value);
    });
  });

  // Process node definitions and set up reactive logic
  graph.nodes.forEach(node => {
    const nodeName = node.definition.name;
    const { contentType, body, signature } = node.definition;

    if (contentType === 'text/javascript') {
      // Evaluate the JavaScript content and bind it to the subject
      const func = new Function('system', body);
      const result = func(system, {
        get: (key) => context.outputs[nodeName].getValue(),
        set: (key, value) => context.outputs[nodeName].next(value)
      });
      context.outputs[nodeName].next(result);
    } else if (contentType === 'application/json+vnd.common.ui') {
      // Set up template rendering
      const { inputs } = signature;
      const inputObservables = [];

      for (const inputName in inputs) {
        if (context.outputs[inputName]) {
          inputObservables.push(context.outputs[inputName]);
        }
      }

      combineLatest(inputObservables).subscribe(values => {
        const inputValues = values.reduce((acc, value, index) => {
          const key = Object.keys(inputs)[index];
          acc[key] = value;
          return acc;
        }, {});

        const renderedTemplate = createElement(node.definition.body, inputValues);
        context.outputs[nodeName].next(renderedTemplate);
      });
    }
  });

  return context;
}

// Function to render the template based on the node body and input values
function renderTemplate(body, inputValues) {
  // Simplified rendering logic for demonstration
  if (body.type === 'repeat' && body.binding in inputValues) {
    return inputValues[body.binding].map(item => {
      return body.template.map(templateNode => {
        return `<${templateNode.tag} class="${body.props?.className}">${item.label}</${templateNode.tag}>`;
      }).join('');
    }).join('');
  } else {
    let children = body.children;
    if (!Array.isArray(body.children)) {
      children = [body.children];
    }

    return `<${body.tag} class="${body.props.className}">${children.map(c => renderTemplate(c, inputValues)).join('\n')}</${body.tag}>`;
  }
}

// Example JSON graph document
const jsonDocument = {
  "nodes": [
    {
      "id": "a",
      "messages": [
        {
          "role": "user",
          "content": "get my todos"
        },
        {
          "role": "assistant",
          "content": "..."
        }
      ],
      "definition": {
        "name": "todos",
        "contentType": "text/javascript",
        "signature": {
          "inputs": {},
          "output": {
            "$id": "https://common.tools/stream.schema.json",
            "type": {
              "$id": "https://common.tools/todos.json"
            }
          }
        },
        "body": "return system.get('todos')"
      }
    },
    {
      "id": "b",
      "messages": [
        {
          "role": "user",
          "content": "render todo"
        },
        {
          "role": "assistant",
          "content": "..."
        }
      ],
      "definition": {
        "name": "ui",
        "contentType": "application/json+vnd.common.ui",
        "signature": {
          "inputs": {
            "todos": {
              "$id": "https://common.tools/stream.schema.json",
              "type": {
                "$id": "https://common.tools/todos.json"
              }
            }
          },
          "output": {
            "$id": "https://common.tools/ui.schema.json"
          }
        },
        "body": {
          "tag": "ul",
          "props": {
            "className": "todo"
          },
          "children": {
            "type": "repeat",
            "binding": "todos",
            "template": {
              "tag": "li",
              "props": {},
              "children": [
                {
                  "tag": "input",
                  "props": {
                    "type": "checkbox",
                    "checked": { type: 'boolean', binding: 'checked' }
                  }
                },
                {
                  "tag": "span",
                  "props": {
                    "className": "todo-label"
                  },
                  "children": [
                    { type: 'literal', binding: 'label' }
                  ]
                }
              ]
            }
          }
        }
      }
    }
  ],
  "edges": [
    { "todos": ["ui", "todos"] }
  ],
  "order": [
    "a",
    "b"
  ]
};

// Create the RxJS network
const context = createRxJSNetworkFromJson(jsonDocument);

function debug() {
  document.querySelector('#tree').innerHTML = JSON.stringify(jsonDocument, null, 2);
  document.querySelector('#ctx').innerHTML = JSON.stringify(snapshot(context), null, 2);
  document.querySelector('#system').innerHTML = JSON.stringify(system.get('todos'), null, 2);
}

function snapshot(ctx) {
  // grab values of behavior subjects
  // preserve literals

  const snapshot = {
    inputs: {},
    outputs: {}
  }
  for (const key in ctx.outputs) {
    const value = ctx.outputs[key].getValue()
    snapshot.outputs[key] = value
  }

  for (const key in ctx.inputs) {
    snapshot.inputs[key] = {}
    for (const inputKey in ctx.inputs[key]) {
      const value = ctx.inputs[key][inputKey].getValue()
      snapshot.inputs[key][inputKey] = value
    }
  }

  return snapshot

}

// Example output for the UI component
context.outputs.ui.subscribe(renderedTemplate => {
  console.log(renderedTemplate);
  document.getElementById('app').replaceChildren(renderedTemplate)
  debug()
});

debug()
