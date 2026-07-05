import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReactionPicker from "./ReactionPicker";

test("renders the three reactions and reports the picked type", async () => {
  const onChange = vi.fn();
  render(<ReactionPicker value="brace" onChange={onChange} />);
  expect(screen.getByText("Brace for Incoming Fire")).toBeInTheDocument();
  expect(screen.getByText("Evasive Manoeuvre")).toBeInTheDocument();
  expect(screen.getByText("Return Fire")).toBeInTheDocument();
  await userEvent.click(screen.getByText("Evasive Manoeuvre"));
  expect(onChange).toHaveBeenCalledWith("evasive");
});
