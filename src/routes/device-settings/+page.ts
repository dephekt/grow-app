export const ssr = false;

export const load = ({ url }: { url: URL }) => {
  return {
    selectedDeviceId: url.searchParams.get('device'),
    selectedSectionId: url.searchParams.get('section')
  };
};
