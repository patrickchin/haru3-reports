export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T>(opts: { ios?: T; android?: T; web?: T; default?: T }): T =>
    (opts.ios ?? opts.default) as T,
};
