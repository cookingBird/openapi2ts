//@ts-nocheck
const axios = require("axios").default;
const path = require("path");
const { Project } = require("ts-morph");


let outPutDir = "src/openapi2ts";

let docType = 'openapi-v2';


//全局导入
let axiosRequest = "import request from '@/utils/request'\n";

let returnConfig = {
  isResult: false
};

let afterRequestBuilt = function afterRequestBuilt(req) {
  req.url = req.url.replace(/^\/oneMap/, '')
  return req
}

//排除自动生成的接口
let omitGeneratorPath = [];
// 排除模块
let omitModules = [];
// 包含模块
let includeModules = [];

// 排除ts内置类型
const globalOmit = {
  Array: true,
  Record: true,
};
//类型转换
const globalTypeConvert = {
  long: "string",
  integer: "number",
};

let funcNameGenerateStrategy = (namePath) => {
  return namePath;
};
let paramTypeGenerateStrategy = (namePath) => {
  return namePath;
};

module.exports = (cfg) => {
  const {
    requestPath,
    apiVersion,
    output,
    excludeApi,
    includeModule,
    excludeModule,
    globalFileHeader } = cfg;
  if (apiVersion === 2)
  {
    docType = 'openapi-v2'
  }
  if (apiVersion === 3)
  {
    docType = 'openapi-v3'
  }
  outPutDir = output ?? outPutDir;

  if (excludeApi && !Array.isArray(excludeApi)) throw Error('excludeApi type is array');
  omitGeneratorPath = excludeApi;
  if (excludeModule && !Array.isArray(excludeModule)) throw Error('excludeModule type is array');
  omitModules = excludeModule;
  if (includeModule && !Array.isArray(includeModule)) throw Error('includeModule type is array');
  includeModules = includeModule;

  axiosRequest = globalFileHeader;
  getResponse(requestPath).then((res) => {
    if (res.status === 200)
    {
      codeGen(res.data);
    }
  })
};

/**
 * @template R
 * @param { string } requestBody
 * @returns { Promise<import("axios").AxiosResponse<R>>}
 */
function getResponse(requestBody) {
  return axios.get(requestBody);
}

const genericTypePattern = /«(.+)»/;
const pathVarPattern = /{(.*?)}/g;

const project = new Project();
function codeGen({ paths, components, definitions }) {
  let schemas;
  if (docType === 'openapi-v2')
  {
    schemas = definitions;
  }
  else if (docType === 'openapi-v3')
  {
    schemas = components.schemas;
  }
  const schemeDeclareStructureGetter = createSchemaGetter(schemas);

  // create schema file
  const baseDeclareFile = project.createSourceFile(
    path.join(process.cwd(), outPutDir, "declare/index.ts"),
    null,
    { overwrite: true }
  );
  //generate type from schema and omit Result
  Object.keys(schemas).forEach((interfaceName) => {
    if (!genericTypePattern.test(interfaceName) && interfaceName !== "Result")
    {
      baseDeclareFile.addInterface(schemeDeclareStructureGetter(interfaceName));
    }
  });

  // emit Result and BasePageResVO schema;
  ["Result", "BasePageResVO"].forEach((name) => {
    /**@type {import('ts-morph').OptionalKind< import('ts-morph').InterfaceDeclarationStructure>} */
    const struct = {
      isExported: true,
      typeParameters: [{ name: "T" }],
      name,
    };
    if (name === "Result")
    {
      ["data", "code", "msg"].forEach((f) => {
        if (f === "data")
        {
          struct.properties = (struct.properties || []).concat({
            name: f,
            type: "T",
          });
        }
        if (f === "code")
        {
          struct.properties = (struct.properties || []).concat({
            name: f,
            type: "number",
          });
        }
        if (f === "msg")
        {
          struct.properties = (struct.properties || []).concat({
            name: f,
            type: "string",
          });
        }
      });
    }
    if (name === "BasePageResVO")
    {
      ["data", "pageNo", "pageSize", "totalCount", "totalPage"].forEach((f) => {
        if (f === "data")
        {
          struct.properties = (struct.properties || []).concat({
            name: f,
            type: "T[]",
          });
        } else
        {
          struct.properties = (struct.properties || []).concat({
            name: f,
            type: "number",
          });
        }
      });
    }
    baseDeclareFile.addInterface(struct);
  });

  // record generated file record
  const importCandidatesMap = {};

  // parse build request infos
  const requests =
    Object
      .entries(paths)
      .map(([url, options]) => {
        const [methods, rest] = Object.entries(options)[0];
        const result = { url, methods, ...rest };
        //parse post requestBody type
        if (rest.requestBody)
        {
          const [ContentType, { schema }] = Object.entries(rest.requestBody.content)[0];
          result.ContentType = ContentType;
          result.postDataScheme = schema;
        }
        //parse response type
        if (!rest.response && !rest.responses)
        {
          console.warn(`request do not have response or responses, url is ${ url }`);
        }
        else if (docType === 'swagger-v3')
        {
          // download 接口没有 content
          result.responseBodySchema =
            Object
              .values((rest.response || rest.responses)["200"].content || {})[0]?.schema;
        }
        else if (docType === 'swagger-2')
        {
          result.responseBodySchema = rest.responses?.['200']?.schema;
        }
        afterRequestBuilt(result);
        return result;
      });

  requests.forEach((req) => {
    const {
      tags,
      url,
    } = req;
    if (omitGeneratorPath.includes(url)) return;
    if (tags[0]?.length > 0 &&
      (omitModules.length > 0 && omitModules.includes(tags[0]))
      || (includeModules.length > 0 && !includeModules.includes(tags[0]))
    ) return;
    const {
      methods,
      ContentType,
      parameters,
      postDataScheme,
      responseBodySchema,
    } = req;

    const reqCategory = tags[0];
    const filePath = reqCategory
      ? path.join(process.cwd(), outPutDir, `api/${ reqCategory }/index.ts`)
      : path.join(process.cwd(), outPutDir, `api/unCategory/index.ts`);

    let tsFile = project.getSourceFile(filePath);

    const importCandidates = importCandidatesMap[filePath]
      ? importCandidatesMap[filePath]
      : [];

    if (!tsFile)
    {
      const headerTpl = `${ axiosRequest }
			`;
      tsFile = project.createSourceFile(filePath, headerTpl, {
        overwrite: true,
      });
    }

    /**@type { import('ts-morph').OptionalKind<import('ts-morph').ImportDeclarationStructure>} */
    const funcStatementStruct = {
      parameters: [],
      returnType: "void",
      typeParameters: [],
    };

    let funcName = url
      .split("/")
      .slice(1)
      .join('/');

    // path variable request
    if (pathVarPattern.test(url))
    {
      funcName = funcName.replaceAll(pathVarPattern, (m1, m2) => m2);
    }
    // to camelCase
    funcName = funcName
      .split("/")
      .map((i, ind) => ind > 0 ? i[0].toUpperCase() + i.substring(1) : i)
      .join("");
    // hook
    funcName = funcNameGenerateStrategy(funcName) || funcName;

    // 处理parameter 类型
    let queryParamsType = null;
    const queryParams = parameters?.filter(p => p.in === 'query')
    if (queryParams?.length)
    {
      let paramTypeName = funcName + "QueryType";
      paramTypeName = paramTypeGenerateStrategy(paramTypeName) || paramTypeName;
      queryParamsType = { name: "params", type: paramTypeName };
      // 添加prams类型
      tsFile.addInterface({
        name: paramTypeName,
        isExported: true,
        properties: createParametersStructure(queryParams),
      });
    };
    queryParamsType ? funcStatementStruct.parameters.push(queryParamsType) : null;

    // data类型
    let bodyParamsType = null;
    if (docType === 'swagger-v3')
    {
      if (postDataScheme)
      {
        //生成requestBody类型,引用生成的declare
        const schemaRef = postDataScheme.$ref;
        if (schemaRef)
        {
          bodyParamsType = { name: "data", type: "unknown" };
          const refName = schemaRef.split("/").reverse()[0];
          if (baseDeclareFile.getInterface(refName))
          {
            bodyParamsType.type = refName;
            importCandidates.push({
              name: refName,
            });
          }
        } else if (postDataScheme.type)
        {
          bodyParamsType.type = typeConvert(postDataScheme.type);
        }
      }
    } else if (docType === 'swagger-v2')
    {
      const jsonParams = parameters?.filter(p => p.in === 'body');
      const schemaRef = jsonParams?.[0]?.schema?.$ref;
      if (schemaRef)
      {
        bodyParamsType = { name: "data", type: "unknown" };
        const refName = schemaRef.split("/").reverse()[0];
        if (baseDeclareFile.getInterface(refName))
        {
          bodyParamsType.type = refName;
          importCandidates.push({
            name: refName,
          });
        }
      }
    }
    bodyParamsType ? funcStatementStruct.parameters.push(bodyParamsType) : null;

    // request url
    let sUrl = url;
    const pathParams = parameters?.filter(p => p.in === 'path');
    if (pathParams?.length)
    {
      //添加路径参数
      pathParams.forEach(paramModel => {
        const { name, schema } = paramModel
        funcStatementStruct.parameters.unshift({
          name: name,
          type: schema?.type || 'string',
        });
        sUrl = sUrl.replace(`{${ name }}`, `\${${ name }}`);
      })
    }
    //返回值类型
    let returnTypeName = returnConfig.isResult ? "Result<unknown>" : "unknown";
    if (responseBodySchema)
    {
      //生成响应类型,引用生成的declare
      if (responseBodySchema.$ref)
      {
        // eg: Result、Result«string»
        const refName = responseBodySchema.$ref.split("/").reverse()[0];
        if (genericTypePattern.test(refName))
        {
          // Result«string»
          // 将返回值类型设为该泛型参数
          returnTypeName = titleConvert(refName);
          //得到泛型参数
          let {
            params,
            finalParam,
            omitResultTitle,
            resultTitle } = getRefGenericParam(refName);
          //多参泛型
          finalParam.includes(",")
            ? (params = params.concat(finalParam.split(",")))
            : params.push(finalParam);
          if (!returnConfig.isResult)
          {
            params = params.filter((p) => p !== "Result");
            returnTypeName = omitResultTitle;
          }
          else
          {
            returnTypeName = resultTitle;
          }

          returnTypeName = Object.entries(globalTypeConvert).reduce(
            (pre, cur) => {
              return pre.replaceAll(cur[0], cur[1]);
            },
            returnTypeName
          );
          params.forEach((p) => {
            baseDeclareFile.getInterface(p) &&
              importCandidates.push({
                name: p,
              });
          });
        }
        else if (refName === "Result")
        {
          // Result
          if (returnConfig.isResult)
          {
            importCandidates.push({
              name: "Result",
            });
            returnTypeName = "Result<unknown>";
          } else
          {
            returnTypeName = "unknown";
          }
        }
      }
    }

    // 添加函数体
    funcStatementStruct.statements = getStatementTpl(
      sUrl,
      methods,
      ContentType,
      queryParamsType,
      bodyParamsType
    );

    funcStatementStruct.name = funcName;
    funcStatementStruct.returnType = `Promise<${ returnTypeName }>`;
    funcStatementStruct.isExported = true;
    importCandidatesMap[filePath] = importCandidates;
    tsFile.addFunction(funcStatementStruct);
    tsFile.formatText({ tabSize: 2, indentSize: 2, indentStyle: "tab" });
  });

  Object.entries(importCandidatesMap).forEach(([path, candidates]) => {
    const file = project.getSourceFile(path);
    if (file && candidates.length > 0)
    {
      // 导入类型
      file.addImportDeclaration({
        isTypeOnly: true,
        namedImports: candidates.reduce(
          (pre, cur) =>
            pre.find((i) => i.name === cur.name) || globalOmit[cur.name]
              ? pre
              : pre.concat(cur),
          []
        ),
        moduleSpecifier: "../../declare/index",
      });
    }
  });
  //code gen
  project.save();
}
function memo(fn) {
  const cache = {};
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache[key]) return cache[key];
    const res = fn(...args)
    if (res)
    {
      cache[key] = res;
    }
    return cache[key];
  }
}

function schemaParser(schemaName, schemas) {
  const schema = schemas[schemaName];
  if (!schema) return null;
  const { title, properties, required } = schema;
  const declareStructure = { isExported: true };
  // title === schemaName
  declareStructure.name = title;
  declareStructure.properties =
    Object
      .entries(properties)
      .map(([key, options]) => {
        const res = {};
        res.name = key;
        res.type =
          typeConvert(
            options.type,
            options.items?.$ref || options.items?.type,
            false
          ) || "unknown";

        res.hasQuestionToken = required ? required.includes(key) : false;

        return res;
      }
      );

  return declareStructure;
}

function createSchemaGetter(schemas) {
  return memo((schemaName) => schemaParser(schemaName, schemas))
}

function createParametersStructure(parameters) {
  const t = /[\[\]]/;
  const arrayParams = parameters.filter((p) => t.test(p.name));
  const regularParams = parameters.filter((p) => !t.test(p.name));
  return regularParams
    .filter(p => p.in === 'query')
    .map((p) => {
      const structure = {
        hasQuestionToken: false,
        name: "",
        type: "unknown",
      };
      structure.name = p.name;
      structure.hasQuestionToken = p.required === false;
      if (p.type)
      {
        structure.type = typeConvert(p.type);
      } else if (p.schema?.type)
      {
        structure.type = typeConvert(p.schema.type);
      } else if (p.schema?.$ref)
      {
        structure.type = p.schema.$ref.split("/").reverse()[0];
      }

      return structure;
    });
}

function getStatementTpl(
  path,
  methods,
  ContentType = "application/json",
  queryParamsType = false,
  dataType = false
) {
  return `return request({
						url: \`${ path }\`,
						method: '${ methods }',
						headers:{
							ContentType:'${ ContentType }'
						},${ methods === "post" && dataType ? "\ndata: data," : "" }${ queryParamsType ? "\nparams: params," : "" }
					})`;
}

/**
 *
 * @param {*} type
 * @param {*} itemsType 数组的内部对象类型
 * @param {*} isGeneric
 * @param {*} genericType
 * @returns
 */
function typeConvert(type, itemsType, isGeneric, genericType) {
  if (type === "array")
  {
    const iType = itemsType?.split("/").reverse()[0] || "unknown";
    return `Array<${ iType !== "object"
      ? globalTypeConvert[iType] || iType
      : genericType || "unknown"
      }>`;
  }

  return globalTypeConvert[type] || (isGeneric ? genericType || "R" : type);
}

/**
 * @description 转换符号 '«' -> '<'
 * @param {string} title
 * @returns {string}
 */
function titleConvert(title) {
  if (genericTypePattern.test(title))
  {
    do
    {
      title = title.replace("«", "<").replace("»", ">");
    } while (title.includes("«"));
  }
  return title;
}
function getRefGenericParam(title) {
  const params = [];
  const genericTypePattern2 = /<(.+)>/;
  if (genericTypePattern.test(title))
  {
    //convert title
    do
    {
      title = title.replace("«", "<").replace("»", ">");
    } while (title.includes("«"));
    //get params
    let t2 = title;
    do
    {
      params.push(t2.split("<")[0]);
      t2 = t2.split("<").slice(1).join("<");
    } while (t2.includes("<"));
    const f = t2.split(">")[0];
    params.push(f);
  }
  const TypeConvertMap = {
    List: "Array",
    Map: "Record",
  };
  Object.entries(TypeConvertMap).forEach(([s, t]) => {
    do
    {
      title = title.replace(s, t);
    } while (title.includes(s));
  });
  return {
    omitResultTitle: [...title.match(genericTypePattern2)][1],
    title,
    resultTitle: title,
    finalParam: params[params.length - 1],
    params: params
      .slice(0, -1)
      .filter(Boolean)
      .map((p) => (TypeConvertMap[p] ? TypeConvertMap[p] : p)),
  };
}
