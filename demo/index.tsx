export const enum BlockStatusMapEnum {
  全部,
  过期的,
  生效中的,
  将来生效的
}

export const enum BlockStatusMapEnum2 {
  全部 = '全部',
  过期的 = '过期的',
  生效中的 = '生效中的',
  将来生效的 = '将来生效的'
}

function App() {
  const title = '安佛';
  const desc = `蜂蜜`;
  const desc2 = /*i18n-disable*/`而非你`;
  const desc3 = `爱上非农 ${ title + desc} 阿福 ${ desc2 } 暗示法比`;
  const getPwdValidator = (pwdRule) => () => ({
    validator(rule, value) {
      if (value?.length > 0) {
        const chineseReg = /[\u4e00-\u9fa5]/;
        const numberReg = /[0-9]/;
        const upperReg = /[A-Z]/;
        const lowerReg = /[a-z]/;
        const charReg = /[`~'"!@#$%^&*()~,.?/{}<>[\]]/;
        const { number, upper, lower, special_char: char } = pwdRule!.pwd_strength;
        if (chineseReg.test(value)) {
          return Promise.reject('不允许包含中文');
        }
        if (number === 1 && !numberReg.test(value)) {
          return Promise.reject('必须包含数字');
        }
        if (upper === 1 && !upperReg.test(value)) {
          return Promise.reject('必须包含大写字母');
        }
        if (lower === 1 && !lowerReg.test(value)) {
          return Promise.reject('必须包含小写字母');
        }
        if (char === 1 && !charReg.test(value)) {
          return Promise.reject('必须包含'+'`~\'"!@#$%^&*()~,.?/{}<>[]');
        }
        if (value.length < pwdRule!.pwd_shortest_length || value.length > 50) {
          return Promise.reject(`密码长度必须大于等于${pwdRule!.pwd_shortest_length}, 小于50`);
        }
      }

      return Promise.resolve();
    }
  });
  return (
    <div className="撒非农" title={"测试"}>
      <img src={Logo} />
      <h1>你好{title}</h1>
      <p>{desc}</p>  
      <div>
      {
          /*i18n-disable*/'中文'
      }
      </div>
    </div>
  );
}

