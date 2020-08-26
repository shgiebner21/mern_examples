import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { userSignupTypes } from 'palmetto-core/dist/constants';
import { signupUserProfileSubmit } from 'actions/signupActions';
import { Col, Form } from 'react-bootstrap';
import { Formik, Form as FormikForm, Field } from 'formik';
import fetchUserInfo from 'actions/authActions';

import { EULA } from 'constants/EULA';

import individual from '../../../../images/individual-logo.svg';
import enterprise from '../../../../images/enterprise-logo.svg';

import { FormikTextInput, FormikCheckboxInput, Button } from '@palmetto/palmetto-components';

import * as yup from 'yup';

import styles from './UserProfile.module.scss';

const PrivacyPolicy = () => {
  return (
    <>
      I accept the License Agreement and <a href="https://www.palmetto.com/privacy-policy">Privacy Policy</a>
    </>
  );
};


const UserProfile = () => {
  const dispatch = useDispatch();
  const { token, user } = useSelector(state => state.auth);

  const userProfileValidation = !user.alchemyTeamId
    ? yup.object().shape({
      firstName: yup.string().required('First Name is required'),
      lastName: yup.string().required('Last Name is required'),
      mobilePhone: yup.string().required('Mobile number is required'),
      privacyPolicy: yup.boolean().oneOf([true], 'You must accept the Privacy Policy and License Agreement'),
      signupType: yup.string().required('You must select a user type to continue'),
    })
    : yup.object().shape({
      firstName: yup.string().required('First Name is required'),
      lastName: yup.string().required('Last Name is required'),
      mobilePhone: yup.string().required('Mobile number is required'),
      privacyPolicy: yup.boolean().oneOf([true], 'You must accept the Privacy Policy and License Agreement'),
    });

  const [ApiErrorMessage, setApiErrorMessage] = useState(null);

  const handleSubmit = async values => {
    if (token) {
      dispatch(signupUserProfileSubmit(values))
        .then(() => {
          dispatch(fetchUserInfo());
        })
        .catch(error => {
          const errorObj = JSON.parse(error.error.data);
          const errorMessage = errorObj?.data?.errors[0]?.message;
          let friendlyErrMessage = '';
          switch (errorMessage) {
            case 'Phone number is not mobile':
              friendlyErrMessage = 'Phone number is not mobile, please enter a mobile number.';
              break;
            case 'Duplicate phone number':
              friendlyErrMessage = 'Phone number is in use, try another number or Login';
              break;
            default:
              friendlyErrMessage = 'Signup error, please try again. If the problem persists, please contact support.';
              break;
          }

          setApiErrorMessage(friendlyErrMessage);
        });
    }
  };

  return (
    <div>
      <h3 className={styles.centerHeader} >Let's Create Your Alchemy Profile</h3>
      {user.alchemyTeamId && (
        <h6 className={`${styles.centerHeader} ${styles.headerMargin}`} >with {user.teamName}</h6>
      )}

      <Formik
        validationSchema={userProfileValidation}
        onSubmit={values => handleSubmit(values)}
        initialValues={{
          firstName: user.firstName !== '__' ? user.firstName : '',
          lastName: user.lastName !== '__' ? user.lastName : '',
          mobilePhone: user?.phoneNumber || '',
          privacyPolicy: user.firstName !== '__' ? true : false,
          signupType: user.signupType || '',
        }}
      >
        {({ values, setFieldValue, touched, errors }) => (
          <FormikForm>

            <Form.Row>
              <Form.Group as={Col} >
                <Field
                  id="firstName"
                  name="firstName"
                  label="First Name"
                  type="text"
                  placeholder="First Name"
                  component={FormikTextInput}
                />
              </Form.Group>
            </Form.Row>
            <Form.Row>
              <Form.Group as={Col} >
                <Field
                  className="fieldSpacing"
                  id="lastName"
                  name="lastName"
                  label="Last Name"
                  type="text"
                  placeholder="Last Name"
                  component={FormikTextInput}
                />
              </Form.Group>
            </Form.Row>

            <Form.Row>
              <Form.Group as={Col} >
                <Field
                  id="mobilePhone"
                  name="mobilePhone"
                  label="Mobile Phone (number will be used to verify your account)"
                  type="text"
                  placeholder="Mobile Phone"
                  component={FormikTextInput}
                />
              </Form.Group>
            </Form.Row>

            <h1 className={styles.serviceHeader}>End User License Agreement</h1>
            <div  className={styles.serviceAgreementBox} dangerouslySetInnerHTML={EULA}></div>

            <Field
              id="privacyPolicy"
              name="privacyPolicy"
              type="checkbox"
              label={<PrivacyPolicy />}
              component={FormikCheckboxInput}
            />
            {!user.alchemyTeamId && (
              <Form.Group className="m-top-md">
                <button
                  type="button"
                  className={`${styles.MemberTypeBtnSelected} ${values.signupType === userSignupTypes.independent ? styles.BtnSelected : null}`}
                  onClick={() => setFieldValue('signupType', userSignupTypes.independent)}
                >
                  <img src={individual} alt="individual logo"></img>
                  <div className={styles.label}>Individual</div>
                  <div className={styles.desc}>I work independently</div>
                </button>
                <button
                  type="button"
                  className={`${styles.MemberTypeBtnSelected} ${values.signupType === userSignupTypes.enterprise ? styles.BtnSelected : null}`}
                  onClick={() => setFieldValue('signupType', userSignupTypes.enterprise)}
                >
                  <img src={enterprise} alt="enterprise logo"></img>
                  <div className={styles.label}>Enterprise</div>
                  <div className={styles.desc}>I manage a team</div>
                </button>
                { touched.signupType && errors.signupType && <div className={styles.errorText} >{errors.signupType}</div> }
              </Form.Group>
            )}
            {ApiErrorMessage && (
              <div className="alert alert-danger mt-2" role="alert">
                {ApiErrorMessage}
              </div>
            )}
            <Form.Group>
              <Button id="userProfileNext" fullWidth type="submit">Next</Button>
            </Form.Group>
          </FormikForm>
        )}
      </Formik>
    </div>
  );
};

export default UserProfile;
