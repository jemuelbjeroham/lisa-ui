import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = fs.existsSync(path.resolve("lisa-ui/package.json")) ? path.resolve("lisa-ui") : process.cwd();
const filename = path.join(root, "src/app/app/page.tsx");
const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodesWithin<Value extends ts.Node>(parent: ts.Node, predicate: (node: ts.Node) => node is Value): Value[] {
  const matches: Value[] = [];
  function visit(node: ts.Node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(parent);
  return matches;
}

function only<Value>(values: Value[], description: string): Value {
  assert.equal(values.length, 1, description);
  return values[0];
}

function variable(name: string) {
  return only(nodesWithin(source, ts.isVariableDeclaration).filter((node) =>
    ts.isIdentifier(node.name) && node.name.text === name), `unique ${name} declaration`);
}

function evaluate(code: string, globals: Record<string, unknown> = {}): unknown {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(javascript, globals, { filename, timeout: 1000 });
}

function className(node: ts.JsxElement) {
  const attribute = node.openingElement.attributes.properties.find((property) =>
    ts.isJsxAttribute(property) && property.name.getText(source) === "className");
  return attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text : null;
}

interface Message { id: string; role: string; content: string }

function chatHarness() {
  const original: Message = { id: "previous", role: "assistant", content: "Existing answer" };
  let messages: Message[] = [original, { id: "streamed", role: "assistant", content: "" }];
  const notifications: { event: Record<string, unknown>; conversationId: string }[] = [];
  const eventText = only(nodesWithin(source, ts.isFunctionDeclaration).filter((node) =>
    node.name?.text === "eventText"), "original eventText parser");
  const finalizers = nodesWithin(source, ts.isIfStatement).filter((node) => {
    const identifiers = nodesWithin(node.expression, ts.isIdentifier).map((identifier) => identifier.text);
    return identifiers.includes("receivedApproval") && identifiers.includes("receivedContent");
  });
  assert.equal(finalizers.length, 2, "notification cleanup and empty-content fallback guards");
  const parser = evaluate(`(() => {
    let receivedContent = false;
    let receivedApproval = false;
    ${eventText.getText(source)}
    const ${variable("handleLine").getText(source)};
    return { handleLine, finish: () => { ${finalizers.map((node) => node.getText(source)).join("\n")} } };
  })()`, {
    conversationId: "conversation", assistantMessageId: "streamed", setStatus: () => {},
    approvals: { notify: (event: Record<string, unknown>, conversationId: string) => {
      notifications.push({ event, conversationId });
    } },
    patchConversation: (conversationId: string, update: (conversation: { messages: Message[] }) => { messages: Message[] }) => {
      assert.equal(conversationId, "conversation");
      messages = update({ messages }).messages;
    },
  }) as { handleLine(line: string): void; finish(): void };
  return { ...parser, original, notifications, get messages() { return messages; } };
}

test("approval records render directly above the composer with explicit action callbacks", () => {
  const composer = only(nodesWithin(source, ts.isJsxElement).filter((node) =>
    className(node) === "composer-area"), "composer area");
  const children = composer.children.filter(ts.isJsxElement);
  assert.equal(className(children[0]), "approval-stack");
  assert.equal(className(children[1]), "composer-frame");
  const recordMap = only(children[0].children.filter(ts.isJsxExpression).filter((node) =>
    node.expression && ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(source) === "approvals.records.map"), "direct approval records render");
  assert.ok(recordMap.expression && ts.isCallExpression(recordMap.expression));
  const render = recordMap.expression.arguments[0];
  assert.ok(ts.isArrowFunction(render) && ts.isJsxSelfClosingElement(render.body));
  assert.equal(render.body.tagName.getText(source), "ApprovalPanel");
  for (const [name, callback] of Object.entries({
    approval: "approval", onDecide: "approvals.decide", onEdit: "approvals.edit", onCancel: "approvals.cancel",
    onResume: "approvals.resume", onExpire: "approvals.expire", onDismiss: "approvals.dismiss",
  })) {
    const attribute: ts.JsxAttribute = only(render.body.attributes.properties.filter(ts.isJsxAttribute).filter((node) =>
      node.name.getText(source) === name), `${name} callback`);
    assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer));
    assert.equal(attribute.initializer.expression?.getText(source), callback);
  }
});

test("original chat parser appends content aliases without mixing reasoning or replacing earlier content", () => {
  const view = chatHarness();
  for (const type of ["content", "token", "text", "message"]) {
    view.handleLine(JSON.stringify({ type, content: `${type} ` }));
    view.handleLine(JSON.stringify({ type: "reasoning", content: "private reasoning" }));
    view.handleLine(JSON.stringify({ type: "status", content: "working" }));
  }
  view.finish();
  assert.equal(view.messages[0], view.original);
  assert.equal(view.messages[1].content, "content token text message ");
  assert.equal(view.notifications.length, 0);
});

test("approval notifications bypass content parsing and suppress only the empty-content fallback", () => {
  const types = ["approval_required", "approval_updated", "tool_execution_status", "execution_suspended", "execution_completed"];
  for (const type of types) {
    const view = chatHarness();
    view.handleLine(JSON.stringify({ type, approval_id: "approval", content: "Not assistant content" }));
    view.finish();
    assert.equal(view.notifications.length, 1, type);
    assert.equal(view.notifications[0].event.type, type);
    assert.equal(view.notifications[0].conversationId, "conversation");
    assert.equal(view.messages.length, 1, type);
    assert.equal(view.messages[0], view.original);

    const mixed = chatHarness();
    mixed.handleLine(JSON.stringify({ type: "content", content: "Keep this answer" }));
    mixed.handleLine(JSON.stringify({ type, content: "Not assistant content" }));
    mixed.finish();
    assert.equal(mixed.messages.length, 2);
    assert.equal(mixed.messages[0], mixed.original);
    assert.equal(mixed.messages[1].content, "Keep this answer");
  }
  const empty = chatHarness();
  empty.finish();
  assert.match(empty.messages[1].content, /without sending a content event/);
});

test("resume callbacks append only fresh chunks to a separate assistant message for each run", () => {
  const initializer = variable("approvals").initializer;
  assert.ok(initializer && ts.isCallExpression(initializer));
  assert.equal(initializer.expression.getText(source), "useApprovals");
  const options = initializer.arguments[1];
  assert.ok(ts.isObjectLiteralExpression(options));
  const callbacks = ["onResumeState", "onResumeContent"].map((name) => {
    const property = only(options.properties.filter(ts.isPropertyAssignment).filter((node) =>
      node.name.getText(source) === name), `${name} handler`);
    assert.ok(ts.isArrowFunction(property.initializer));
    return `${name}: ${property.initializer.getText(source)}`;
  });
  const original = { id: "previous", role: "assistant", content: "Original answer" };
  let messages: Message[] = [original];
  const statuses: string[] = [];
  let nextId = 0;
  const handlers = evaluate(`({ ${callbacks.join(",")} })`, {
    activeId: "conversation", resumedMessage: { current: null }, id: () => `resumed-${++nextId}`,
    setStatus: (status: string) => statuses.push(status),
    patchConversation: (conversationId: string, update: (conversation: { messages: Message[] }) => { messages: Message[] }) => {
      assert.equal(conversationId, "conversation");
      messages = update({ messages }).messages;
    },
  }) as { onResumeState(running: boolean): void; onResumeContent(text: string): void };
  handlers.onResumeState(true);
  assert.equal(messages.length, 1);
  handlers.onResumeContent("New ");
  handlers.onResumeContent("answer");
  handlers.onResumeState(false);
  assert.equal(messages.length, 2);
  assert.equal(messages[0], original);
  assert.equal(messages[1].id, "resumed-1");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].content, "New answer");
  const firstResume = messages[1];
  handlers.onResumeState(true);
  handlers.onResumeContent("Next continuation");
  handlers.onResumeState(false);
  assert.equal(messages.length, 3);
  assert.equal(messages[0], original);
  assert.equal(messages[1], firstResume);
  assert.equal(messages[2].id, "resumed-2");
  assert.equal(messages[2].content, "Next continuation");
  assert.deepEqual(statuses, ["generating", "idle", "generating", "idle"]);
});