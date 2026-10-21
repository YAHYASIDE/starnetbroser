const test = require("node:test");
const assert = require("node:assert/strict");
const { zoomAction, nextZoom, readZoom, MAX, MIN } = require("./zoom");

test("Ctrl + / - / 0 (and the number pad) are the zoom keys; nothing else is", () => {
  assert.equal(zoomAction({ type: "keyDown", control: true, key: "=" }), "in");
  assert.equal(zoomAction({ type: "keyDown", control: true, key: "+" }), "in");
  assert.equal(zoomAction({ type: "keyDown", control: true, key: "-" }), "out");
  assert.equal(zoomAction({ type: "keyDown", control: true, code: "NumpadAdd", key: "Add" }), "in");
  assert.equal(zoomAction({ type: "keyDown", control: true, key: "0" }), "reset");
  assert.equal(zoomAction({ type: "keyDown", key: "-" }), null);
  assert.equal(zoomAction({ type: "keyUp", control: true, key: "-" }), null);
  assert.equal(zoomAction({ type: "keyDown", control: true, key: "c" }), null);
  assert.equal(zoomAction({ type: "keyDown", control: true, alt: true, key: "-" }), null);
});

test("each step is half a level, kept between the limits", () => {
  assert.equal(nextZoom(0, "in"), 0.5);
  assert.equal(nextZoom(0, "out"), -0.5);
  assert.equal(nextZoom(2.5, "reset"), 0);
  assert.equal(nextZoom(MAX, "in"), MAX);
  assert.equal(nextZoom(MIN, "out"), MIN);
});

test("the saved level survives a broken settings file", () => {
  assert.equal(readZoom('{"zoom":1.5}'), 1.5);
  assert.equal(readZoom('{"zoom":99}'), MAX);
  assert.equal(readZoom("nope"), 0);
  assert.equal(readZoom("{}"), 0);
});
