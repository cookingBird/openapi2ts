module.exports = {
  /**@description 请求地址 */
  requestPath: undefined,
  /**@description openapi版本 */
  apiVersion: 2,
  /**@description 输出文件地址 */
  output: 'src/openapi2ts',
  /**@description 排除的api  */
  exclude: [],
  /**@description 排除生成的模块 */
  excludeModule: [],
  /**@description 全局文件头 */
  globalFileHeader: '',
  /**@description 排除的内置类型  */
  omitTypes: ['Array', 'Record'],
  /**@description java type 2 ts type */
  convertTypes: {
    long: "string",
    integer: "number",
  },
}
