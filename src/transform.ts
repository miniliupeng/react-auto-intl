import {
  NodePath,
  PluginObj,
  PluginPass,
  transformSync,
  // transformFromAstSync
} from "@babel/core";
// import parser from "@babel/parser";
import template from "@babel/template";
import {
  jsxExpressionContainer,
  JSXText,
  StringLiteral,
  TemplateLiteral,
} from "@babel/types";
import prettier from "prettier";
import fs from "fs";
import path from "path";
import generate from "@babel/generator";
import { readFile } from "node:fs/promises";

const INTL_NAME = "intl";
const DEFINE_MESSAGES = "defineMessages";
const INTL_MESSAGES = "intlMessages";
const INTL_FILE_PATH = "@/locales";
const INTL_DISABLE = "i18n-disable";

const OUTPUT_ZH_FILE = path.resolve(process.cwd(), "src/locales/zh.json");
const OUTPUT_EN_FILE = path.resolve(process.cwd(), "src/locales/en.json");

const messagesZh: Record<string, string> = {}; // 存储所有中文消息
const messagesEn: Record<string, string> = {}; // 存储所有英文消息，值为空字符串

function createFormatMessageCall(text: string, expressionParams?: string[]) {
  return template.expression(
    `${INTL_NAME}.formatMessage(${INTL_MESSAGES}["${text.trim()}"]${
      expressionParams
        ? `, {
      ${expressionParams.map((key, index) => `'placeholder${index + 1}': ${key}`).join(",")}
    }`
        : ""
    })`,
    {
      plugins: ["typescript"],
    }
  )();
}

// 判断字符串是否包含中文字符
function isChinese(str) {
  return str && /[\u4e00-\u9fa5]/.test(str); // 匹配中文字符的正则表达式
}

// 标记该文件需要跳过处理
function fileSkip(state: PluginPass, excludeFiles: string[]) {
  const filename = state.filename || "";
  state.skip = excludeFiles.some((file) => filename.includes(file));
  return state.skip;
}

// 标记该文本需要跳过遍历处理
function traverseSkip(path: NodePath) {
  if (path.node.leadingComments) {
    path.node.leadingComments = path.node.leadingComments.filter(
      (comment, index) => {
        if (comment.value.includes(INTL_DISABLE)) {
          path.node.skip = true;
          return false;
        }
        return true;
      }
    );
  }
  if (
    path.findParent((p) => p.isImportDeclaration() || p.isTSTypeAnnotation())
  ) {
    path.node.skip = true;
  }
}

function chineseSkip(path: NodePath, value: string) {
  if (!isChinese(value)) {
    path.node.skip = true;
  }
}

function babelAutoIntlPlugin({
  excludeFiles = [],
}: {
  excludeFiles: string[];
}): PluginObj {
  return {
    visitor: {
      Program(path, state) {
        // 文件跳过处理
        const shouldSkip = fileSkip(state, excludeFiles);
        if (shouldSkip) return;

        let index = 0; // import语句的行数
        let methodName1 = DEFINE_MESSAGES;
        let methodName2 = INTL_NAME;
        function createImportIntl() {
          while (path.node.body[index].type === "ImportDeclaration") {
            index++;
          }

          if (path.scope.getBinding(methodName1)) {
            methodName1 = path.scope.generateUid(methodName1);
          }
          if (path.scope.getBinding(methodName2)) {
            methodName2 = path.scope.generateUid(methodName2);
          }

          const ast = template.statements(`
            import { ${methodName1} } from 'react-intl';
            import ${methodName2} from '${INTL_FILE_PATH}';
          `)();
          path.node.body.splice(index, 0, ...ast);
        }
        // 添加import
        createImportIntl();

        // 获取所有中文消息
        function getAllCnMessages() {
          const messageKeys: string[] = [];
          path.traverse({
            TSEnumDeclaration(path) {
              // 如果是 const enum，遍历枚举成员
              path.node.members.forEach((member) => {
                const key = member.id.name || member.id.value;
                chineseSkip(path, key); // 自定义函数，检查是否是中文并跳过
                if (path.node.skip) return;
                const trimmedValue = key.trim();
                if (!messageKeys.includes(trimmedValue))
                  messageKeys.push(trimmedValue);
              });
            },
            "JSXText|StringLiteral"(path) {
              // traverseSkip(path);
              const node = path.node as StringLiteral | JSXText;
              console.log(node.value);
              
              chineseSkip(path, node.value);
              if (node.skip) return;
              // console.log("JSXText|StringLiteral", node.value);

              const trimmedValue = node.value.trim();
              if (!messageKeys.includes(trimmedValue))
                messageKeys.push(trimmedValue);
            },
            TemplateLiteral(path) {
              traverseSkip(path);
              const node = path.node as TemplateLiteral;
              if (node.skip) return;
              const value = path.node.quasis
                .map((item) => item.value.raw)
                .reduce((prev, curr, index) => {
                  if (index !== path.node.quasis.length - 1) {
                    prev = `${prev}${curr}{placeholder${index + 1}}`;
                  } else {
                    prev = `${prev}${curr}`;
                  }
                  return prev;
                }, "");

              chineseSkip(path, value);
              if (node.skip) return;

              const trimmedValue = value.trim();
              if (!messageKeys.includes(trimmedValue))
                messageKeys.push(trimmedValue);
            },
          });
          // console.log(messageKeys);

          if (messageKeys.length > 0) {
            const messagesAst =
              template.statement(`const ${INTL_MESSAGES} = ${methodName1}({
              ${messageKeys
                .map((key) => `'${key}': { id: "${key}" }`)
                .join(",")}
            })`)();
            path.node.body.splice(index + 2, 0, messagesAst);

            // 存储消息到全局的 messagesZh 和 messagesEn 对象中
            messageKeys.forEach((key) => {
              if (!messagesZh[key]) {
                messagesZh[key] = key;
                messagesEn[key] = ""; // en.json 的值为空字符串
              }
            });
          }
        }
        getAllCnMessages();
      },

      JSXText(path, state) {
        if (state.skip || path.node.skip) return;

        path.replaceWith(
          jsxExpressionContainer(createFormatMessageCall(path.node.value))
        );
        path.skip();
      },

      StringLiteral(path, state) {
        if (state.skip || path.node.skip) return;

        if (path.parent.type === "JSXAttribute") {
          path.replaceWith(
            jsxExpressionContainer(createFormatMessageCall(path.node.value))
          );
        } else {
          // 跳过对象属性中的文本
          if (
            path.findParent(
              (p) =>
                p.isVariableDeclarator() && p.node.id.name === INTL_MESSAGES
            )
          ) {
            return;
          }
          
          chineseSkip(path, path.node.value);
          if (path.node.skip) return;
          path.replaceWith(createFormatMessageCall(path.node.value));
        }
        path.skip();
      },

      TemplateLiteral(path, state) {
        if (state.skip || path.node.skip) return;
        const expressionParams = path.node.expressions.map(
          (item) => generate.default(item).code
        );
        // console.log(expressionParams);

        const value = path.node.quasis
          .map((item) => item.value.raw)
          .reduce((prev, curr, index) => {
            if (index !== path.node.quasis.length - 1) {
              prev = `${prev}${curr}{placeholder${index + 1}}`;
            }
            return prev;
          }, "");
        path.replaceWith(createFormatMessageCall(value, expressionParams));
        path.skip();
      },
    },

    post() {
      if (this.skip) return;
      // 将所有的 messages 写入到 zh.json);

      fs.writeFileSync(
        OUTPUT_ZH_FILE,
        JSON.stringify(messagesZh, null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        OUTPUT_EN_FILE,
        JSON.stringify(messagesZh, null, 2),
        "utf-8"
      );
    },
  };
}

export async function transformFile(filePath: string) {
  const sourceCode = await readFile(filePath, "utf-8");

  // const ast = parser.parse(sourceCode, {
  //   sourceType: "module",
  //   plugins: ["jsx", "typescript"],
  // });

  // const res = transformFromAstSync(ast, sourceCode, {
  //   plugins: [babelAutoIntlPlugin],
  //   retainLines: true,
  //   presets: ["@babel/preset-typescript"],
  //   filename: filePath
  // });
  const res = transformSync(sourceCode, {
    plugins: [babelAutoIntlPlugin],
    retainLines: true,
    presets: ["@babel/preset-typescript"],
    filename: filePath
  });
  const formatedCode = await prettier.format(res?.code!, {
    filepath: filePath,
  });

  return formatedCode;
}
