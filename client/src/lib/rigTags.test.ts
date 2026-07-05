import { parseRigCommands, stripRigTags } from "./rigTags";

test("parseRigCommands extracts verb + attrs from each tag", () => {
  const cmds = parseRigCommands('ok [[RIG damage name="Stalker" loc="hull" amount="3"]] done');
  expect(cmds).toEqual([{ verb: "damage", attrs: { name: "Stalker", loc: "hull", amount: "3" } }]);
});

test("stripRigTags removes complete and half-streamed tags", () => {
  expect(stripRigTags('Hit! [[RIG damage name="X"]] rest')).toBe("Hit!  rest".trim());
  expect(stripRigTags("Streaming [[RIG damage nam")).toBe("Streaming");
});
