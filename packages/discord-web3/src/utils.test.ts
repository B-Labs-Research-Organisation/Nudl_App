import test from "tape";
import * as utils from "./utils";
test("calculateSafeChecksum matches expected for working Safe batch JSON", t => {
  const batchJson = {"version":"1.0","chainId":"1","createdAt":1750255509666,"meta":{"name":"Transactions Batch","description":"","txBuilderVersion":"1.18.0","createdFromSafeAddress":"0x7eC991e1648B7F1d5fa91ae3688C9f36a5CA6C8B","createdFromOwnerAddress":""},"transactions":[{"to":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","value":"0","data":null,"contractMethod":{"inputs":[{"name":"to","type":"address","internalType":"address"},{"name":"value","type":"uint256","internalType":"uint256"}],"name":"transfer","payable":false},"contractInputsValues":{"to":"0x116Da30d890533516f2683731F9Bd167807448b8","value":"1000000"}}]} 
  const expectedChecksum = "0xf1966baf2cdc7c68774e5be291e81549cc7438efbceccaad0003bb12f8d30baf";
  const actualChecksum = utils.calculateSafeChecksum(batchJson);
  t.equal(actualChecksum, expectedChecksum, "Checksum matches expected value");
  t.end();
});
