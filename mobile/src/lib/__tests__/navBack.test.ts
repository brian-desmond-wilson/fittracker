import { goBackOr } from "../navBack";

function fakeRouter(canGoBack: boolean) {
  return {
    canGoBack: () => canGoBack,
    back: jest.fn(),
    replace: jest.fn(),
  };
}

describe("goBackOr", () => {
  it("pops when there is somewhere to go back to", () => {
    const router = fakeRouter(true);
    goBackOr(router, "/(tabs)/training");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("replaces to the fallback when the stack has nothing to pop", () => {
    const router = fakeRouter(false);
    goBackOr(router, "/(tabs)/training");
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/training");
    expect(router.back).not.toHaveBeenCalled();
  });
});
