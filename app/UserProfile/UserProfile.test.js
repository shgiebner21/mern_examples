import React from 'react';
import { render, wait, fireEvent, waitForElement } from '@testing-library/react';
import UserProfile from './UserProfile';
import { signupUserProfileSubmit } from '../../../../actions/signupActions';
import fetchUserInfo from 'actions/authActions';

jest.mock('../../../../actions/signupActions');
jest.mock('actions/authActions');

jest.mock('constants/EULA', () => ({EULA: {version: '0.0.1', __html: `<div>this is a mock eula</div>`}}));

const mockDispatch = jest.fn();
const mockHistoryPush = jest.fn();

const mockState = { auth: { token: 'abc', user: { firstName: '__', alchemyTeamId: '123' } } };
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: fn => fn(mockState),
}));

jest.mock('react-router-dom', () => ({
  useHistory: () => ({ push: mockHistoryPush }),
}));

describe('UserProfile', () => {
  let mockStateTest;
  beforeEach(() => {
    mockStateTest = mockState;
    signupUserProfileSubmit.mockClear();
  });

  test('The component load snapshot matches', () => {
    const { asFragment } = render(<UserProfile />);

    expect(asFragment(<UserProfile />)).toMatchSnapshot();
  });

  test('shows yup validation error when First Name is empty', async () => {
    const { getByText, getByLabelText } = render(<UserProfile />);
    const firstNameInput = getByLabelText('First Name');
    fireEvent.blur(firstNameInput);
    const inputFeedback = await waitForElement(() => getByText('First Name is required'));

    expect(inputFeedback).toBeInTheDocument();
  });

  test('shows yup validation error when Last Name is empty', async () => {
    const { getByText, getByLabelText } = render(<UserProfile />);
    const lastNameInput = getByLabelText('Last Name');
    fireEvent.blur(lastNameInput);
    const inputFeedback = await waitForElement(() => getByText('Last Name is required'));

    expect(inputFeedback).toBeInTheDocument();
  });

  test('shows yup validation error when Mobile Phone is empty', async () => {
    const { getByText, getByLabelText } = render(<UserProfile />);
    const mobilePhoneInput = getByLabelText('Mobile Phone (number will be used to verify your account)');
    fireEvent.blur(mobilePhoneInput);
    const inputFeedback = await waitForElement(() => getByText('Mobile number is required'));

    expect(inputFeedback).toBeInTheDocument();
  });

  test('shows yup validation error when terms have not been accepted', async () => {
    const { getByText } = render(<UserProfile />);
    const termsAcceptedInput = getByText('Next');
    await wait(() => {
      fireEvent.click(getByText('Next').parentElement);
    });
    fireEvent.click(termsAcceptedInput);
    const inputFeedback = await waitForElement(() =>
      getByText('You must accept the Privacy Policy and License Agreement'),
    );

    expect(inputFeedback).toBeInTheDocument();
  });

  test('shows yup validation error when signup type has not been selected', async () => {
    mockStateTest.auth.user.alchemyTeamId = null;
    const { getByText } = render(<UserProfile />);
    const signupTypeInput = getByText('Next');
    fireEvent.click(signupTypeInput.parentElement);

    const inputFeedback = await waitForElement(() => getByText('You must select a user type to continue'));

    expect(inputFeedback).toBeInTheDocument();
  });

  test('should submit the fields if the form is valid and the user is an individual', async () => {
    mockStateTest.auth.user.alchemyTeamId = null;
    mockDispatch.mockResolvedValue(signupUserProfileSubmit);
    const { getByText, getByLabelText } = render(<UserProfile />);

    fireEvent.change(getByLabelText('First Name'), { target: { value: 'Fill' } });
    fireEvent.change(getByLabelText('Last Name'), { target: { value: 'Murray' } });
    fireEvent.change(getByLabelText('Mobile Phone (number will be used to verify your account)'), { target: { value: '803-555-1234' } });
    fireEvent.click(getByLabelText('I accept the License Agreement and'), { target: { value: true } });
    fireEvent.click(getByText('Individual'));

    await wait(() => {
      fireEvent.click(getByText('Next').parentElement);
    });
    await wait(() => expect(signupUserProfileSubmit.mock.calls.length).toBe(1));
    expect(signupUserProfileSubmit.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "firstName": "Fill",
        "lastName": "Murray",
        "mobilePhone": "803-555-1234",
        "privacyPolicy": true,
        "signupType": "independent",
      }
    `);
    expect(fetchUserInfo).toHaveBeenCalled();
  });

  test('should submit the fields if the form is valid', async () => {
    mockStateTest.auth.user.alchemyTeamId = '123';
    mockDispatch.mockResolvedValue(signupUserProfileSubmit);
    const { getByText, getByLabelText } = render(<UserProfile />);

    fireEvent.change(getByLabelText('First Name'), { target: { value: 'Fill' } });
    fireEvent.change(getByLabelText('Last Name'), { target: { value: 'Murray' } });
    fireEvent.change(getByLabelText('Mobile Phone (number will be used to verify your account)'), { target: { value: '803-555-1234' } });
    fireEvent.click(getByLabelText('I accept the License Agreement and'), {
      target: { value: true },
    });

    await wait(() => {
      fireEvent.click(getByText('Next').parentElement);
    });
    await wait(() => expect(signupUserProfileSubmit.mock.calls.length).toBe(1));
    expect(signupUserProfileSubmit.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "firstName": "Fill",
        "lastName": "Murray",
        "mobilePhone": "803-555-1234",
        "privacyPolicy": true,
        "signupType": "",
      }
    `);
    expect(fetchUserInfo).toHaveBeenCalled();
  });
});


describe('UserProfile Phone error tests', () => {

test('The page displays an error message if the api indicates the phone number is a landline', async () => {
  const mockErrorObj = { data: { errors: [{ message: 'Phone number is not mobile' }] } };
  mockDispatch.mockRejectedValue({ error: { data: JSON.stringify(mockErrorObj) } });
  const { getByText, getByLabelText } = render(<UserProfile />);
  fireEvent.input(getByLabelText('First Name'), { target: { value: 'Alice' } });
  fireEvent.input(getByLabelText('Last Name'), { target: { value: 'Bob' } });
  fireEvent.input(getByLabelText('Mobile Phone (number will be used to verify your account)'), { target: { value: '444-333-2222' } });
  await waitForElement(() => fireEvent.click(getByLabelText('I accept the License Agreement and')));
  await wait(() => {
    fireEvent.click(getByText('Next').parentElement);
  });

  expect(getByText('Phone number is not mobile, please enter a mobile number.')).toBeInTheDocument();
});

test('The page displays an error message if the api returns a generic error', async () => {
  const mockErrorObj = {
    data: {
      errors: [{ message: 'Signup error, please try again. If the problem persists, please contact support.' }],
    },
  };
  mockDispatch.mockRejectedValue({ error: { data: JSON.stringify(mockErrorObj) } });

  const { getByText, getByLabelText } = render(<UserProfile />);

  fireEvent.input(getByLabelText('First Name'), { target: { value: 'Fill' } });
  fireEvent.input(getByLabelText('Last Name'), { target: { value: 'Murray' } });
  fireEvent.input(getByLabelText('Mobile Phone (number will be used to verify your account)'), { target: { value: '803-333-2222' } });
  fireEvent.click(getByLabelText('I accept the License Agreement and'));

  await wait(() => {
    fireEvent.click(getByText('Next').parentElement);
  });

  expect(
    getByText('Signup error, please try again. If the problem persists, please contact support.'),
  ).toBeInTheDocument();
});

});
