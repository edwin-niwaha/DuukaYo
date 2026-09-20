export interface ReceiptPrinter {
  deviceName: string;
  connect(): Promise<void>;
  print(text: string): Promise<void>;
}
export class UnconfiguredPrinter implements ReceiptPrinter {
  deviceName = "No tested printer configured";
  async connect() {
    throw new Error(
      "Select and test a named physical printer before enabling this adapter.",
    );
  }
  async print(_text: string) {
    void _text;
    throw new Error("Physical printing is not configured. Use Share receipt.");
  }
}
